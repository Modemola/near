//! Test double for `outlayer.testnet`: same `request_execution` signature and
//! the same yield/resume mechanics, with the "worker" played by the test,
//! which calls `resolve` with whatever output it wants delivered.

use near_sdk::json_types::U128;
use near_sdk::serde_json::{self, Value};
use near_sdk::store::IterableMap;
use near_sdk::{
    env, near, AccountId, Gas, GasWeight, NearToken, PanicOnDefault, Promise, PromiseError,
};

const YIELD_REGISTER: u64 = 0;

#[near(serializers = [borsh, json])]
#[derive(Clone)]
pub struct Request {
    pub id: u64,
    pub caller: AccountId,
    pub payer: AccountId,
    pub deposit: U128,
    pub source: String,
    pub input_data: String,
    pub secrets_ref: String,
    pub data_id: Vec<u8>,
    pub resolved: bool,
    /// Large outputs are kept here and fetched by the callback, as OutLayer's
    /// two-call flow does (a yield can only be resumed with 1024 bytes).
    pub output: Option<String>,
}

#[near(contract_state)]
#[derive(PanicOnDefault)]
pub struct MockOutlayer {
    requests: IterableMap<u64, Request>,
    next_id: u64,
}

#[near]
impl MockOutlayer {
    #[init]
    pub fn new() -> Self {
        Self {
            requests: IterableMap::new(b"r"),
            next_id: 0,
        }
    }

    #[payable]
    #[allow(clippy::too_many_arguments)]
    pub fn request_execution(
        &mut self,
        source: Value,
        resource_limits: Option<Value>,
        input_data: Option<String>,
        secrets_ref: Option<Value>,
        response_format: Option<String>,
        payer_account_id: Option<AccountId>,
        params: Option<Value>,
    ) {
        let _ = (resource_limits, response_format, params);
        let id = self.next_id;
        self.next_id += 1;
        let promise = env::promise_yield_create(
            "on_resume",
            &serde_json::to_vec(&serde_json::json!({ "request_id": id })).unwrap(),
            Gas::from_tgas(20),
            GasWeight(1),
            YIELD_REGISTER,
        );
        let data_id = env::read_register(YIELD_REGISTER).expect("data id");
        self.requests.insert(
            id,
            Request {
                id,
                caller: env::predecessor_account_id(),
                payer: payer_account_id.unwrap_or_else(env::predecessor_account_id),
                deposit: U128(env::attached_deposit().as_yoctonear()),
                source: source.to_string(),
                input_data: input_data.unwrap_or_default(),
                secrets_ref: secrets_ref.map(|s| s.to_string()).unwrap_or_default(),
                data_id,
                resolved: false,
                output: None,
            },
        );
        env::promise_return(promise);
    }

    /// Play the worker: deliver `output` (or null) for a request.
    pub fn resolve(&mut self, request_id: u64, output: Option<String>) -> bool {
        let mut r = self
            .requests
            .get(&request_id)
            .cloned()
            .expect("no such request");
        assert!(!r.resolved, "already resolved");
        r.resolved = true;
        r.output = output;
        let data_id: [u8; 32] = r.data_id.clone().try_into().unwrap();
        self.requests.insert(request_id, r);
        env::promise_yield_resume(&data_id, b"\"stored\"")
    }

    #[private]
    pub fn on_resume(
        &mut self,
        request_id: u64,
        #[callback_result] response: Result<String, PromiseError>,
    ) -> Option<String> {
        let r = self
            .requests
            .get(&request_id)
            .cloned()
            .expect("no such request");
        // Like OutLayer: keep a small fee and refund the rest to the payer.
        let fee = NearToken::from_millinear(1).as_yoctonear().min(r.deposit.0);
        if r.deposit.0 > fee {
            Promise::new(r.payer.clone())
                .transfer(NearToken::from_yoctonear(r.deposit.0 - fee))
                .detach();
        }
        match response {
            Ok(_) => r.output,
            Err(_) => env::panic_str("execution timed out"),
        }
    }

    pub fn list_requests(&self) -> Vec<Request> {
        self.requests.values().cloned().collect()
    }
}
