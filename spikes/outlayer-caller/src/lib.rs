//! Spike: a contract that asks OutLayer to run a WASM job inside a TDX worker
//! and records the result in a callback (yield/resume round trip).
use near_sdk::serde_json::{json, Value};
use near_sdk::{env, near, AccountId, Gas, NearToken, PanicOnDefault, Promise, PromiseError};

#[near(contract_state)]
#[derive(PanicOnDefault)]
pub struct Contract {
    outlayer: AccountId,
    last_result: Option<String>,
    runs: u64,
}

#[near]
impl Contract {
    #[init]
    pub fn new(outlayer: AccountId) -> Self {
        Self { outlayer, last_result: None, runs: 0 }
    }

    /// Forward the attached deposit to OutLayer and run `project_id` on `input`.
    #[payable]
    pub fn run(&mut self, project_id: String, input: String) -> Promise {
        let args = json!({
            "source": {"Project": {"project_id": project_id, "version_key": null}},
            "resource_limits": {"max_instructions": 1_000_000_000u64, "max_memory_mb": 128, "max_execution_seconds": 20},
            "input_data": input,
            "secrets_ref": null,
            "response_format": "Text",
            "payer_account_id": env::predecessor_account_id(),
            "params": null
        });
        Promise::new(self.outlayer.clone())
            .function_call(
                "request_execution".to_string(),
                args.to_string().into_bytes(),
                env::attached_deposit(),
                Gas::from_tgas(200),
            )
            .then(
                Promise::new(env::current_account_id()).function_call(
                    "on_result".to_string(),
                    vec![],
                    NearToken::from_yoctonear(0),
                    Gas::from_tgas(20),
                ),
            )
    }

    #[private]
    pub fn on_result(&mut self, #[callback_result] result: Result<Value, PromiseError>) -> String {
        self.runs += 1;
        let text = match result {
            Ok(v) => v.to_string(),
            Err(_) => "ERROR: execution promise failed".to_string(),
        };
        env::log_str(&format!("spike on_result #{}: {}", self.runs, text));
        self.last_result = Some(text.clone());
        text
    }

    pub fn get_last_result(&self) -> Option<String> {
        self.last_result.clone()
    }
}
