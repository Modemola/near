//! Proctor: certificates for AI models graded on private test sets.
//!
//! An author registers a test set (its commitment hash and price) whose
//! plaintext lives only as an OutLayer secret locked to the grader build. A
//! requester pays for an eval; the contract dispatches the set's chunks to the
//! grader on OutLayer, receives each result through OutLayer's yield/resume
//! callback, re-verifies every answer's NEAR AI `provider_tee` Ed25519
//! signature, and when every chunk of every run is in, records a certificate
//! and pays the author.

use near_sdk::json_types::{U128, U64};
use near_sdk::serde_json::{self, json};
use near_sdk::store::{IterableMap, LookupMap, Vector};
use near_sdk::{
    env, near, require, AccountId, BorshStorageKey, Gas, NearToken, PanicOnDefault, Promise,
    PromiseError,
};

mod validate;
pub use validate::{ChunkReport, Confusion};

/// A chunk is tried at most this many times before the eval fails.
pub const MAX_ATTEMPTS: u8 = 3;
/// Gas attached to each `request_execution`: OutLayer reserves at least
/// 50 TGas for its own settlement callback and burns a few more admitting the
/// request.
pub const GAS_FOR_OUTLAYER: Gas = Gas::from_tgas(75);
/// Gas for `on_chunk`: JSON parsing plus one Ed25519 check (~0.21 TGas) per
/// answer.
pub const GAS_FOR_CALLBACK: Gas = Gas::from_tgas(30);
/// Gas kept back by `dispatch` for its own bookkeeping.
const GAS_RESERVE: Gas = Gas::from_tgas(15);
/// Basis points in one.
const BPS: u128 = 10_000;

#[near(serializers = [borsh])]
#[derive(BorshStorageKey)]
enum Key {
    Models,
    Sets,
    Evals,
    EvalsStarted,
    Certificates,
    CertificatesBySet,
    CertificatesBySetInner { set_hash: Vec<u8> },
}

/// Settings the owner controls.
#[near(serializers = [borsh, json])]
#[derive(Clone, Debug, PartialEq)]
pub struct Config {
    pub outlayer: AccountId,
    /// HTTPS URL of the published grader build and its SHA-256 (hex).
    pub grader_url: String,
    pub grader_hash: String,
    /// The NEAR AI key, sealed by the grader to itself; only a grader run
    /// called by this contract can open it. Not a secret on its own.
    pub sealed_api_key: String,
    /// Deposit attached to each OutLayer request; OutLayer refunds what the
    /// run did not use to the requester.
    pub job_deposit: U128,
    pub max_execution_seconds: u32,
    pub runs_per_eval: u8,
    pub treasury: AccountId,
    /// Registers model signing keys after checking their attestation.
    pub attester: AccountId,
}

/// A NEAR AI model and the Ed25519 keys its TEE signs responses with.
#[near(serializers = [borsh, json])]
#[derive(Clone, Debug, PartialEq)]
pub struct Model {
    pub model_id: String,
    pub signers: Vec<String>,
    /// SHA-256 of the attestation report the keys were taken from.
    pub attestation_report_sha256: String,
    pub registered_at: U64,
}

#[near(serializers = [borsh, json])]
#[derive(Clone, Debug, PartialEq)]
pub struct TestSet {
    pub set_id: String,
    pub author: AccountId,
    pub title: String,
    pub description: String,
    /// SHA-256 (hex) of the canonical plaintext set.
    pub commitment: String,
    pub item_count: u32,
    pub chunk_size: u32,
    pub max_tokens: u32,
    /// Price of one eval, in yoctoNEAR.
    pub price: U128,
    /// The author's share of the price, in basis points; the rest goes to the
    /// treasury.
    pub author_bps: u16,
    /// The author's OutLayer secrets profile that holds the set.
    pub secrets_profile: String,
    /// How many evals each model may ever start on this set. Bounds how much
    /// repeated scoring can reveal about the items.
    pub eval_cap_per_model: u32,
    pub active: bool,
    pub created_at: U64,
}

/// Parameters an author registers a set with.
#[near(serializers = [json])]
#[derive(Clone, Debug)]
pub struct NewTestSet {
    pub set_id: String,
    pub title: String,
    pub description: String,
    pub commitment: String,
    pub item_count: u32,
    pub chunk_size: u32,
    pub max_tokens: u32,
    pub price: U128,
    pub author_bps: u16,
    pub secrets_profile: String,
    pub eval_cap_per_model: u32,
}

#[near(serializers = [borsh, json])]
#[derive(Clone, Debug, PartialEq)]
#[serde(tag = "state")]
pub enum ChunkState {
    Pending {
        attempts: u8,
    },
    InFlight {
        attempts: u8,
    },
    Done {
        confusion: Confusion,
        records_digest: String,
        signer: String,
        /// Block in which the chunk was accepted; its `chunk_accepted` event
        /// (with every signed answer) is in that block's receipt outcomes.
        block_height: U64,
    },
    Failed {
        attempts: u8,
        error: String,
    },
}

#[near(serializers = [borsh, json])]
#[derive(Clone, Debug, PartialEq)]
pub enum EvalStatus {
    Running,
    Certified,
    Failed,
}

#[near(serializers = [borsh, json])]
#[derive(Clone, Debug, PartialEq)]
pub struct Eval {
    pub id: U64,
    pub requester: AccountId,
    pub set_id: String,
    pub model_id: String,
    pub runs: u8,
    pub chunks_per_run: u32,
    /// One nonce per run, bound into each run's attestation report.
    pub nonces: Vec<String>,
    pub price: U128,
    pub job_deposit: U128,
    /// Deposit still held for OutLayer jobs not yet dispatched.
    pub escrow: U128,
    /// The grader build the eval runs on, fixed at request time.
    pub grader_hash: String,
    /// Run-major: index = run * chunks_per_run + chunk.
    pub chunks: Vec<ChunkState>,
    pub status: EvalStatus,
    pub error: Option<String>,
    pub created_at: U64,
}

#[near(serializers = [borsh, json])]
#[derive(Clone, Debug, PartialEq)]
pub struct Certificate {
    pub eval_id: U64,
    pub set_id: String,
    pub set_commitment: String,
    pub model_id: String,
    pub grader_hash: String,
    pub item_count: u32,
    pub max_tokens: u32,
    /// Totals per run.
    pub runs: Vec<Confusion>,
    /// Basis points, mean over runs, with the range across runs.
    pub accuracy_bps: u16,
    pub accuracy_min_bps: u16,
    pub accuracy_max_bps: u16,
    pub detection_bps: u16,
    pub false_alarm_bps: u16,
    pub signers: Vec<String>,
    pub issued_at: U64,
    pub issued_at_block: U64,
}

#[near(contract_state)]
#[derive(PanicOnDefault)]
pub struct Proctor {
    owner: AccountId,
    config: Config,
    paused: bool,
    models: IterableMap<String, Model>,
    sets: IterableMap<String, TestSet>,
    evals: LookupMap<u64, Eval>,
    next_eval_id: u64,
    /// "set_id|model_id" -> evals started.
    evals_started: LookupMap<String, u32>,
    certificates: LookupMap<u64, Certificate>,
    certificates_by_set: LookupMap<String, Vector<u64>>,
}

fn valid_id(s: &str, max: usize) -> bool {
    !s.is_empty()
        && s.len() <= max
        && s.bytes()
            .all(|b| b.is_ascii_alphanumeric() || b"-_./".contains(&b))
}

pub(crate) fn is_hex(s: &str, len: usize) -> bool {
    s.len() == len
        && s.bytes()
            .all(|b| b.is_ascii_hexdigit() && !b.is_ascii_uppercase())
}

fn bps(numerator: u32, denominator: u32) -> u16 {
    if denominator == 0 {
        0
    } else {
        ((numerator as u128 * BPS) / denominator as u128) as u16
    }
}

fn storage_cost(bytes: u64) -> NearToken {
    env::storage_byte_cost().saturating_mul(bytes as u128)
}

#[near]
impl Proctor {
    #[init]
    pub fn new(owner: AccountId, config: Config) -> Self {
        Self::check_config(&config);
        Self {
            owner,
            config,
            paused: false,
            models: IterableMap::new(Key::Models),
            sets: IterableMap::new(Key::Sets),
            evals: LookupMap::new(Key::Evals),
            next_eval_id: 0,
            evals_started: LookupMap::new(Key::EvalsStarted),
            certificates: LookupMap::new(Key::Certificates),
            certificates_by_set: LookupMap::new(Key::CertificatesBySet),
        }
    }

    // ---- Owner and attester -------------------------------------------------

    pub fn set_config(&mut self, config: Config) {
        self.assert_owner();
        Self::check_config(&config);
        self.config = config;
    }

    pub fn set_paused(&mut self, paused: bool) {
        self.assert_owner();
        self.paused = paused;
    }

    pub fn transfer_ownership(&mut self, new_owner: AccountId) {
        self.assert_owner();
        self.owner = new_owner;
    }

    /// Register or replace a model's signing keys. The attester checks the
    /// keys against the model's TEE attestation report first.
    pub fn register_model(
        &mut self,
        model_id: String,
        signers: Vec<String>,
        attestation_report_sha256: String,
    ) {
        require!(
            env::predecessor_account_id() == self.config.attester,
            "only the attester"
        );
        require!(valid_id(&model_id, 128), "invalid model id");
        require!(!signers.is_empty() && signers.len() <= 8, "1 to 8 signers");
        require!(
            signers.iter().all(|s| is_hex(s, 64)),
            "signers must be lowercase hex Ed25519 keys"
        );
        require!(
            is_hex(&attestation_report_sha256, 64),
            "report hash must be lowercase hex"
        );
        let model = Model {
            model_id: model_id.clone(),
            signers,
            attestation_report_sha256,
            registered_at: U64(env::block_timestamp()),
        };
        self.models.insert(model_id, model);
    }

    pub fn remove_model(&mut self, model_id: String) {
        require!(
            env::predecessor_account_id() == self.config.attester,
            "only the attester"
        );
        self.models.remove(&model_id);
    }

    // ---- Authors ------------------------------------------------------------

    /// Register a test set. Attach enough NEAR for its storage; the rest is
    /// refunded.
    #[payable]
    pub fn register_set(&mut self, set: NewTestSet) -> TestSet {
        self.assert_running();
        require!(valid_id(&set.set_id, 64), "invalid set id");
        require!(!self.sets.contains_key(&set.set_id), "set id taken");
        require!(
            set.title.len() <= 120 && !set.title.is_empty(),
            "title must be 1 to 120 bytes"
        );
        require!(set.description.len() <= 1000, "description too long");
        require!(
            is_hex(&set.commitment, 64),
            "commitment must be lowercase hex SHA-256"
        );
        require!((1..=10_000).contains(&set.item_count), "1 to 10000 items");
        require!((1..=40).contains(&set.chunk_size), "chunk size 1 to 40");
        require!(
            (256..=32_000).contains(&set.max_tokens),
            "max tokens 256 to 32000"
        );
        require!(u128::from(set.author_bps) <= BPS, "author share above 100%");
        require!(
            valid_id(&set.secrets_profile, 64),
            "invalid secrets profile"
        );
        require!(set.eval_cap_per_model >= 1, "eval cap must be at least 1");
        let chunks = set.item_count.div_ceil(set.chunk_size);
        require!(
            chunks * u32::from(self.config.runs_per_eval) <= 600,
            "too many chunks per eval"
        );

        let before = env::storage_usage();
        let stored = TestSet {
            set_id: set.set_id.clone(),
            author: env::predecessor_account_id(),
            title: set.title,
            description: set.description,
            commitment: set.commitment,
            item_count: set.item_count,
            chunk_size: set.chunk_size,
            max_tokens: set.max_tokens,
            price: set.price,
            author_bps: set.author_bps,
            secrets_profile: set.secrets_profile,
            eval_cap_per_model: set.eval_cap_per_model,
            active: true,
            created_at: U64(env::block_timestamp()),
        };
        self.sets.insert(set.set_id, stored.clone());
        self.sets.flush();
        let cost = storage_cost(env::storage_usage().saturating_sub(before));
        let attached = env::attached_deposit();
        require!(
            attached >= cost,
            format!(
                "attach at least {} yoctoNEAR for storage",
                cost.as_yoctonear()
            )
        );
        refund(
            &env::predecessor_account_id(),
            attached.saturating_sub(cost),
        );
        stored
    }

    /// Stop new evals on a set. Running evals finish.
    pub fn retire_set(&mut self, set_id: String) {
        let mut set = self
            .sets
            .get(&set_id)
            .cloned()
            .unwrap_or_else(|| env::panic_str("no such set"));
        require!(
            env::predecessor_account_id() == set.author,
            "only the author"
        );
        set.active = false;
        self.sets.insert(set_id, set);
    }

    // ---- Requesters ---------------------------------------------------------

    /// Pay for an eval of `model_id` on `set_id` and start its first chunks.
    /// Attach the set's price, one job deposit per chunk per run, and storage;
    /// the rest is refunded. Returns the eval id.
    #[payable]
    pub fn request_eval(&mut self, set_id: String, model_id: String) -> U64 {
        self.assert_running();
        require!(
            !self.config.sealed_api_key.is_empty(),
            "grader key not sealed yet"
        );
        let set = self
            .sets
            .get(&set_id)
            .cloned()
            .unwrap_or_else(|| env::panic_str("no such set"));
        require!(set.active, "set is retired");
        require!(self.models.contains_key(&model_id), "model not registered");
        let cap_key = format!("{set_id}|{model_id}");
        let started = self.evals_started.get(&cap_key).copied().unwrap_or(0);
        require!(
            started < set.eval_cap_per_model,
            "eval cap reached for this model on this set"
        );

        let runs = self.config.runs_per_eval;
        let chunks_per_run = set.item_count.div_ceil(set.chunk_size);
        let jobs = u128::from(chunks_per_run) * u128::from(runs) * u128::from(MAX_ATTEMPTS);
        let escrow = self
            .config
            .job_deposit
            .0
            .checked_mul(jobs)
            .expect("escrow overflow");

        let id = self.next_eval_id;
        self.next_eval_id += 1;
        let seed = env::random_seed();
        let nonces = (0..runs)
            .map(|r| {
                let mut input = seed.clone();
                input.extend_from_slice(&id.to_le_bytes());
                input.push(r);
                env::sha256(&input)
                    .iter()
                    .map(|b| format!("{b:02x}"))
                    .collect()
            })
            .collect();
        let eval = Eval {
            id: U64(id),
            requester: env::predecessor_account_id(),
            set_id,
            model_id,
            runs,
            chunks_per_run,
            nonces,
            price: set.price,
            job_deposit: self.config.job_deposit,
            escrow: U128(escrow),
            grader_hash: self.config.grader_hash.clone(),
            chunks: vec![
                ChunkState::Pending { attempts: 0 };
                chunks_per_run as usize * runs as usize
            ],
            status: EvalStatus::Running,
            error: None,
            created_at: U64(env::block_timestamp()),
        };

        let before = env::storage_usage();
        self.evals.insert(id, eval);
        self.evals_started.insert(cap_key, started + 1);
        self.evals.flush();
        self.evals_started.flush();
        // Room for the certificate the eval ends with.
        let storage = storage_cost(env::storage_usage().saturating_sub(before) + 1_500);
        let required = set.price.0 + escrow + storage.as_yoctonear();
        let attached = env::attached_deposit().as_yoctonear();
        require!(
            attached >= required,
            format!("attach at least {required} yoctoNEAR")
        );
        refund(
            &env::predecessor_account_id(),
            NearToken::from_yoctonear(attached - required),
        );
        emit(
            "eval_requested",
            json!({"eval_id": U64(id), "set_id": set.set_id, "requester": env::predecessor_account_id()}),
        );
        self.dispatch_jobs(id);
        U64(id)
    }

    /// Start the next pending chunks of a running eval, as many as the
    /// attached gas allows. Anyone may call it: the work is paid from the
    /// eval's escrow. Returns how many jobs were started.
    pub fn dispatch(&mut self, eval_id: U64) -> u32 {
        self.assert_running();
        self.dispatch_jobs(eval_id.0)
    }

    // ---- OutLayer callback --------------------------------------------------

    #[private]
    pub fn on_chunk(
        &mut self,
        eval_id: U64,
        index: u32,
        attempt: u8,
        #[callback_result] result: Result<Option<String>, PromiseError>,
    ) -> bool {
        let Some(mut eval) = self.evals.get(&eval_id.0).cloned() else {
            return false;
        };
        let i = index as usize;
        if eval.status != EvalStatus::Running
            || eval.chunks.get(i) != Some(&ChunkState::InFlight { attempts: attempt })
        {
            env::log_str(&format!(
                "eval {} chunk {index}: stale result ignored",
                eval_id.0
            ));
            return false;
        }
        let run = (index / eval.chunks_per_run) as usize;
        let chunk = index % eval.chunks_per_run;
        let set = self.sets.get(&eval.set_id).cloned().expect("set exists");
        let model = self.models.get(&eval.model_id).cloned();

        let verdict = match (result, model) {
            (_, None) => Err("model was removed".to_string()),
            (Err(_), _) => Err("OutLayer execution failed or timed out".to_string()),
            (Ok(None), _) => Err("grader returned no output".to_string()),
            (Ok(Some(out)), Some(model)) => {
                validate::check_chunk(&out, &set, &model, &eval.nonces[run], chunk)
            }
        };
        match verdict {
            Ok(report) => {
                emit(
                    "chunk_accepted",
                    json!({
                        "eval_id": eval_id,
                        "index": index,
                        "run": run,
                        "chunk": chunk,
                        "set_id": eval.set_id,
                        "model_id": eval.model_id,
                        "nonce": eval.nonces[run],
                        "signer": report.signer,
                        "records_digest": report.records_digest,
                        "confusion": report.confusion,
                        "answers": report.answers.iter().map(|(t, s)| json!({"text": t, "signature": s})).collect::<Vec<_>>(),
                    }),
                );
                eval.chunks[i] = ChunkState::Done {
                    confusion: report.confusion,
                    records_digest: report.records_digest,
                    signer: report.signer,
                    block_height: U64(env::block_height()),
                };
            }
            Err(error) => {
                env::log_str(&format!(
                    "eval {} chunk {index} attempt {attempt} failed: {error}",
                    eval_id.0
                ));
                eval.chunks[i] = ChunkState::Failed {
                    attempts: attempt,
                    error,
                };
            }
        }

        let ok = matches!(eval.chunks[i], ChunkState::Done { .. });
        if eval
            .chunks
            .iter()
            .all(|c| matches!(c, ChunkState::Done { .. }))
        {
            self.certify(&mut eval, &set);
        } else if eval
            .chunks
            .iter()
            .any(|c| matches!(c, ChunkState::Failed { attempts, .. } if *attempts >= MAX_ATTEMPTS))
        {
            self.fail(&mut eval, "a chunk failed on every attempt");
        }
        self.evals.insert(eval_id.0, eval);
        ok
    }

    // ---- Views --------------------------------------------------------------

    pub fn get_config(&self) -> Config {
        self.config.clone()
    }

    pub fn get_owner(&self) -> AccountId {
        self.owner.clone()
    }

    pub fn is_paused(&self) -> bool {
        self.paused
    }

    pub fn get_model(&self, model_id: String) -> Option<Model> {
        self.models.get(&model_id).cloned()
    }

    pub fn list_models(&self) -> Vec<Model> {
        self.models.values().cloned().collect()
    }

    pub fn get_set(&self, set_id: String) -> Option<TestSet> {
        self.sets.get(&set_id).cloned()
    }

    pub fn list_sets(&self, from_index: Option<u32>, limit: Option<u32>) -> Vec<TestSet> {
        self.sets
            .values()
            .skip(from_index.unwrap_or(0) as usize)
            .take(limit.unwrap_or(50).min(100) as usize)
            .cloned()
            .collect()
    }

    /// Number of evals ever requested; the newest has id `eval_count - 1`.
    /// Clients should not wait for `request_eval` or `dispatch` to finish:
    /// their OutLayer callbacks stay pending until the grader answers.
    pub fn eval_count(&self) -> U64 {
        U64(self.next_eval_id)
    }

    pub fn get_eval(&self, eval_id: U64) -> Option<Eval> {
        self.evals.get(&eval_id.0).cloned()
    }

    pub fn get_certificate(&self, eval_id: U64) -> Option<Certificate> {
        self.certificates.get(&eval_id.0).cloned()
    }

    pub fn list_certificates(
        &self,
        set_id: String,
        from_index: Option<u32>,
        limit: Option<u32>,
    ) -> Vec<Certificate> {
        let Some(ids) = self.certificates_by_set.get(&set_id) else {
            return vec![];
        };
        ids.iter()
            .skip(from_index.unwrap_or(0) as usize)
            .take(limit.unwrap_or(50).min(100) as usize)
            .filter_map(|id| self.certificates.get(id).cloned())
            .collect()
    }

    /// Evals started for a model on a set, against the set's cap.
    pub fn evals_started(&self, set_id: String, model_id: String) -> u32 {
        self.evals_started
            .get(&format!("{set_id}|{model_id}"))
            .copied()
            .unwrap_or(0)
    }

    /// The deposit `request_eval` needs, excluding storage (add ~0.05 NEAR).
    pub fn quote_eval(&self, set_id: String) -> U128 {
        let set = self
            .sets
            .get(&set_id)
            .unwrap_or_else(|| env::panic_str("no such set"));
        let jobs = u128::from(set.item_count.div_ceil(set.chunk_size))
            * u128::from(self.config.runs_per_eval)
            * u128::from(MAX_ATTEMPTS);
        U128(set.price.0 + self.config.job_deposit.0 * jobs)
    }
}

impl Proctor {
    fn assert_owner(&self) {
        require!(
            env::predecessor_account_id() == self.owner,
            "only the owner"
        );
    }

    fn assert_running(&self) {
        require!(!self.paused, "paused");
    }

    fn check_config(c: &Config) {
        require!(
            c.grader_url.starts_with("https://"),
            "grader URL must be https"
        );
        require!(
            is_hex(&c.grader_hash, 64),
            "grader hash must be lowercase hex SHA-256"
        );
        require!((1..=5).contains(&c.runs_per_eval), "1 to 5 runs per eval");
        require!(
            (10..=180).contains(&c.max_execution_seconds),
            "10 to 180 seconds"
        );
        require!(
            c.job_deposit.0 >= NearToken::from_millinear(1).as_yoctonear(),
            "job deposit too small"
        );
    }

    fn dispatch_jobs(&mut self, id: u64) -> u32 {
        let mut eval = self
            .evals
            .get(&id)
            .cloned()
            .unwrap_or_else(|| env::panic_str("no such eval"));
        if eval.status != EvalStatus::Running {
            return 0;
        }
        let set = self.sets.get(&eval.set_id).cloned().expect("set exists");
        let per_job = GAS_FOR_OUTLAYER.saturating_add(GAS_FOR_CALLBACK);
        let mut started = 0u32;
        for i in 0..eval.chunks.len() {
            let remaining = env::prepaid_gas().saturating_sub(env::used_gas());
            if remaining < per_job.saturating_add(GAS_RESERVE) {
                break;
            }
            let attempts = match &eval.chunks[i] {
                ChunkState::Pending { attempts } => *attempts,
                ChunkState::Failed { attempts, .. } if *attempts < MAX_ATTEMPTS => *attempts,
                _ => continue,
            };
            let attempt = attempts + 1;
            require!(eval.escrow.0 >= eval.job_deposit.0, "escrow exhausted");
            eval.escrow = U128(eval.escrow.0 - eval.job_deposit.0);
            eval.chunks[i] = ChunkState::InFlight { attempts: attempt };
            let run = i / eval.chunks_per_run as usize;
            let chunk = i as u32 % eval.chunks_per_run;
            self.start_job(&eval, &set, i as u32, run, chunk, attempt);
            started += 1;
        }
        self.evals.insert(id, eval);
        started
    }

    fn start_job(
        &self,
        eval: &Eval,
        set: &TestSet,
        index: u32,
        run: usize,
        chunk: u32,
        attempt: u8,
    ) {
        let job = json!({
            "set_id": set.set_id,
            "model": eval.model_id,
            "chunk": chunk,
            "chunk_size": set.chunk_size,
            "nonce": eval.nonces[run],
            "max_tokens": set.max_tokens,
            "sealed_api_key": self.config.sealed_api_key,
        });
        let args = json!({
            "source": {"WasmUrl": {"url": self.config.grader_url, "hash": eval.grader_hash, "build_target": "wasm32-wasip2"}},
            "resource_limits": {
                "max_instructions": 100_000_000_000u64,
                "max_memory_mb": 256,
                "max_execution_seconds": self.config.max_execution_seconds,
            },
            "input_data": job.to_string(),
            "secrets_ref": {"profile": set.secrets_profile, "account_id": set.author},
            "response_format": "Text",
            "payer_account_id": eval.requester,
            "params": null,
        });
        Promise::new(self.config.outlayer.clone())
            .function_call(
                "request_execution".to_string(),
                serde_json::to_vec(&args).expect("args serialise"),
                NearToken::from_yoctonear(eval.job_deposit.0),
                GAS_FOR_OUTLAYER,
            )
            .then(
                Self::ext(env::current_account_id())
                    .with_static_gas(GAS_FOR_CALLBACK)
                    .on_chunk(eval.id, index, attempt),
            )
            .detach();
    }

    fn certify(&mut self, eval: &mut Eval, set: &TestSet) {
        let mut runs = vec![Confusion::default(); eval.runs as usize];
        let mut signers: Vec<String> = Vec::new();
        for (i, c) in eval.chunks.iter().enumerate() {
            if let ChunkState::Done {
                confusion, signer, ..
            } = c
            {
                runs[i / eval.chunks_per_run as usize].add(confusion);
                if !signers.contains(signer) {
                    signers.push(signer.clone());
                }
            }
        }
        let accs: Vec<u16> = runs.iter().map(|r| bps(r.tp + r.tn, r.total())).collect();
        let mean = |f: &dyn Fn(&Confusion) -> u16| {
            (runs.iter().map(|r| u32::from(f(r))).sum::<u32>() / runs.len() as u32) as u16
        };
        let cert = Certificate {
            eval_id: eval.id,
            set_id: set.set_id.clone(),
            set_commitment: set.commitment.clone(),
            model_id: eval.model_id.clone(),
            grader_hash: eval.grader_hash.clone(),
            item_count: set.item_count,
            max_tokens: set.max_tokens,
            accuracy_bps: mean(&|r| bps(r.tp + r.tn, r.total())),
            accuracy_min_bps: *accs.iter().min().unwrap_or(&0),
            accuracy_max_bps: *accs.iter().max().unwrap_or(&0),
            detection_bps: mean(&|r| bps(r.tp, r.tp + r.fn_)),
            false_alarm_bps: mean(&|r| bps(r.fp, r.fp + r.tn)),
            runs,
            signers,
            issued_at: U64(env::block_timestamp()),
            issued_at_block: U64(env::block_height()),
        };
        self.certificates.insert(eval.id.0, cert);
        self.certificates_by_set
            .entry(set.set_id.clone())
            .or_insert_with(|| {
                Vector::new(Key::CertificatesBySetInner {
                    set_hash: env::sha256(set.set_id.as_bytes()),
                })
            })
            .push(eval.id.0);
        eval.status = EvalStatus::Certified;

        let author_share = eval.price.0 * u128::from(set.author_bps) / BPS;
        refund(&set.author, NearToken::from_yoctonear(author_share));
        refund(
            &self.config.treasury,
            NearToken::from_yoctonear(eval.price.0 - author_share),
        );
        refund(&eval.requester, NearToken::from_yoctonear(eval.escrow.0));
        eval.escrow = U128(0);
        emit(
            "eval_certified",
            json!({"eval_id": eval.id, "set_id": set.set_id, "model_id": eval.model_id}),
        );
    }

    fn fail(&mut self, eval: &mut Eval, reason: &str) {
        eval.status = EvalStatus::Failed;
        eval.error = Some(reason.to_string());
        refund(
            &eval.requester,
            NearToken::from_yoctonear(eval.price.0 + eval.escrow.0),
        );
        eval.escrow = U128(0);
        emit("eval_failed", json!({"eval_id": eval.id, "reason": reason}));
    }
}

/// Log a NEP-297 event: `EVENT_JSON:{"standard":"proctor",...}`.
fn emit(event: &str, data: near_sdk::serde_json::Value) {
    env::log_str(&format!(
        "EVENT_JSON:{}",
        json!({"standard": "proctor", "version": "1.0.0", "event": event, "data": [data]})
    ));
}

fn refund(to: &AccountId, amount: NearToken) {
    if !amount.is_zero() {
        Promise::new(to.clone()).transfer(amount).detach();
    }
}

#[cfg(test)]
mod tests;
