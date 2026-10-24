//! End-to-end tests on a local NEAR sandbox: the Proctor contract talks to a
//! mock OutLayer that uses real yield/resume, and the test plays the grader,
//! signing answers with a real Ed25519 key like NEAR AI's model TEE.

use ed25519_dalek::{Signer, SigningKey};
use near_workspaces::network::Sandbox;
use near_workspaces::types::{Gas, NearToken};
use near_workspaces::{Account, Contract, Worker};
use serde_json::{json, Value};
use sha2::{Digest, Sha256};

const MODEL: &str = "Qwen/Qwen3.8-27B";
const SET: &str = "scam-v1";
const GRADER_HASH: &str = "bdd0f9f8d66f542c681528124e02786c2ee116b590b4266f5d42f1e61cc48200";
const ITEMS: u32 = 5;
const CHUNK: u32 = 2;
const RUNS: u8 = 2;

struct Env {
    worker: Worker<Sandbox>,
    proctor: Contract,
    outlayer: Contract,
    owner: Account,
    attester: Account,
    author: Account,
    requester: Account,
    treasury: Account,
    keeper: Account,
    model_key: SigningKey,
}

fn sha(s: &str) -> String {
    hex::encode(Sha256::digest(s.as_bytes()))
}

fn near(n: u128) -> NearToken {
    NearToken::from_near(n)
}

async fn account(worker: &Worker<Sandbox>, name: &str, balance: u128) -> anyhow::Result<Account> {
    Ok(worker
        .root_account()?
        .create_subaccount(name)
        .initial_balance(near(balance))
        .transact()
        .await?
        .into_result()?)
}

fn config(env_outlayer: &str, treasury: &str, attester: &str) -> Value {
    json!({
        "outlayer": env_outlayer,
        "grader_url": "https://grader.example.com/proctor-grader.wasm",
        "grader_hash": GRADER_HASH,
        "sealed_api_key": "AQIDsealed",
        "job_deposit": NearToken::from_millinear(10).as_yoctonear().to_string(),
        "max_execution_seconds": 180,
        "runs_per_eval": RUNS,
        "treasury": treasury,
        "attester": attester,
    })
}

async fn setup() -> anyhow::Result<Env> {
    let worker = near_workspaces::sandbox().await?;
    let proctor_wasm = near_workspaces::compile_project("./").await?;
    let mock_wasm = near_workspaces::compile_project("./mock-outlayer").await?;

    let owner = account(&worker, "owner", 20).await?;
    let attester = account(&worker, "attester", 20).await?;
    let author = account(&worker, "author", 20).await?;
    let requester = account(&worker, "requester", 50).await?;
    let treasury = account(&worker, "treasury", 5).await?;
    let keeper = account(&worker, "keeper", 20).await?;

    let outlayer = account(&worker, "outlayer", 20)
        .await?
        .deploy(&mock_wasm)
        .await?
        .into_result()?;
    outlayer.call("new").transact().await?.into_result()?;
    let proctor = account(&worker, "proctor", 30)
        .await?
        .deploy(&proctor_wasm)
        .await?
        .into_result()?;
    proctor
        .call("new")
        .args_json(json!({
            "owner": owner.id(),
            "config": config(outlayer.id().as_str(), treasury.id().as_str(), attester.id().as_str()),
        }))
        .transact()
        .await?
        .into_result()?;

    let model_key = SigningKey::from_bytes(&[42u8; 32]);
    attester
        .call(proctor.id(), "register_model")
        .args_json(json!({
            "model_id": MODEL,
            "signers": [hex::encode(model_key.verifying_key().to_bytes())],
            "attestation_report_sha256": sha("report"),
        }))
        .transact()
        .await?
        .into_result()?;

    author
        .call(proctor.id(), "register_set")
        .args_json(json!({"set": {
            "set_id": SET,
            "title": "Scam filter test set",
            "description": "Private scam and look-alike messages",
            "commitment": sha("the private set"),
            "item_count": ITEMS,
            "chunk_size": CHUNK,
            "max_tokens": 4000,
            "price": near(1).as_yoctonear().to_string(),
            "author_bps": 7000,
            "secrets_profile": "scamset",
            "eval_cap_per_model": 2,
        }}))
        .deposit(NearToken::from_millinear(100))
        .transact()
        .await?
        .into_result()?;

    Ok(Env {
        worker,
        proctor,
        outlayer,
        owner,
        attester,
        author,
        requester,
        treasury,
        keeper,
        model_key,
    })
}

/// What the grader would print for a job, signed with `key`.
fn grader_output(job: &Value, key: &SigningKey, confusion: (u32, u32, u32, u32, u32)) -> String {
    let chunk = job["chunk"].as_u64().unwrap() as u32;
    let n = (ITEMS - chunk * CHUNK).min(CHUNK);
    let answers: Vec<Value> = (0..n)
        .map(|i| {
            let text = format!(
                "{}:{}:{}",
                job["model"].as_str().unwrap(),
                sha(&format!("req {chunk} {i} {}", job["nonce"])),
                sha(&format!("resp {i}"))
            );
            json!({"text": text, "signature": hex::encode(key.sign(text.as_bytes()).to_bytes())})
        })
        .collect();
    let (tp, fp, tn, fn_, unparsed) = confusion;
    json!({
        "success": true,
        "error": null,
        "output": {
            "set_id": job["set_id"], "model": job["model"], "chunk": chunk, "nonce": job["nonce"],
            "set_commitment": sha("the private set"),
            "n": n,
            "confusion": {"tp": tp, "fp": fp, "tn": tn, "fn_": fn_, "unparsed": unparsed},
            "signer": hex::encode(key.verifying_key().to_bytes()),
            "attestation_report_sha256": sha("report"),
            "answers": answers,
            "records_digest": sha(&format!("digest {chunk}")),
        }
    })
    .to_string()
}

/// A plausible confusion for a chunk of n items: all right.
fn all_right(n: u32) -> (u32, u32, u32, u32, u32) {
    (n / 2 + n % 2, 0, n / 2, 0, 0)
}

async fn pending_requests(env: &Env) -> anyhow::Result<Vec<Value>> {
    let all: Vec<Value> = env.outlayer.view("list_requests").await?.json()?;
    Ok(all.into_iter().filter(|r| r["resolved"] == false).collect())
}

fn job_of(request: &Value) -> Value {
    serde_json::from_str(request["input_data"].as_str().unwrap()).unwrap()
}

/// Where a request sits in the eval's chunk list: run * chunks + chunk.
fn chunk_index(eval: &Value, job: &Value) -> usize {
    let run = eval["nonces"]
        .as_array()
        .unwrap()
        .iter()
        .position(|n| *n == job["nonce"])
        .unwrap();
    run * eval["chunks_per_run"].as_u64().unwrap() as usize
        + job["chunk"].as_u64().unwrap() as usize
}

async fn sleep() {
    tokio::time::sleep(std::time::Duration::from_millis(400)).await;
}

/// Poll `check` until it returns Some, for up to ~40 s.
async fn wait_for<T, F, Fut>(mut check: F) -> anyhow::Result<T>
where
    F: FnMut() -> Fut,
    Fut: std::future::Future<Output = anyhow::Result<Option<T>>>,
{
    for _ in 0..100 {
        if let Some(v) = check().await? {
            return Ok(v);
        }
        sleep().await;
    }
    anyhow::bail!("timed out waiting")
}

/// Deliver an output for a request and wait for its chunk to settle.
async fn resolve(
    env: &Env,
    eval_id: u64,
    request: &Value,
    output: Option<String>,
) -> anyhow::Result<()> {
    let eval = get_eval(env, eval_id).await?;
    let i = chunk_index(&eval, &job_of(request));
    env.keeper
        .call(env.outlayer.id(), "resolve")
        .args_json(json!({"request_id": request["id"], "output": output}))
        .max_gas()
        .transact()
        .await?
        .into_result()?;
    wait_for(|| async move {
        let e = get_eval(env, eval_id).await?;
        Ok((e["chunks"][i]["state"] != "InFlight" || e["status"] != "Running").then_some(()))
    })
    .await
}

/// Submit an eval request without waiting for its OutLayer callbacks (they
/// stay pending until resolved). Returns the new eval id, or the panic.
async fn try_request_eval(
    env: &Env,
    deposit: Option<NearToken>,
) -> anyhow::Result<Result<u64, String>> {
    let before: String = env.proctor.view("eval_count").await?.json()?;
    let deposit = match deposit {
        Some(d) => d,
        None => {
            let quote: String = env
                .proctor
                .view("quote_eval")
                .args_json(json!({"set_id": SET}))
                .await?
                .json()?;
            NearToken::from_yoctonear(
                quote.parse::<u128>()? + NearToken::from_millinear(100).as_yoctonear(),
            )
        }
    };
    let tx = env
        .requester
        .call(env.proctor.id(), "request_eval")
        .args_json(json!({"set_id": SET, "model_id": MODEL}))
        .deposit(deposit)
        .gas(Gas::from_tgas(300))
        .transact_async()
        .await?;
    let before: u64 = before.parse()?;
    for _ in 0..100 {
        let now: String = env.proctor.view("eval_count").await?.json()?;
        if now.parse::<u64>()? > before {
            return Ok(Ok(before));
        }
        if let std::task::Poll::Ready(outcome) = tx.status().await? {
            if outcome.is_failure() {
                return Ok(Err(format!("{:?}", outcome.failures())));
            }
        }
        sleep().await;
    }
    anyhow::bail!("request_eval neither landed nor failed")
}

async fn request_eval(env: &Env) -> anyhow::Result<u64> {
    try_request_eval(env, None)
        .await?
        .map_err(|e| anyhow::anyhow!(e))
}

fn todo(eval: &Value) -> usize {
    eval["chunks"]
        .as_array()
        .unwrap()
        .iter()
        .filter(|c| {
            c["state"] == "Pending"
                || (c["state"] == "Failed" && c["attempts"].as_u64().unwrap() < 3)
        })
        .count()
}

/// Call `dispatch` until every chunk is in flight or settled.
async fn dispatch_all(env: &Env, eval_id: u64) -> anyhow::Result<()> {
    loop {
        let eval = get_eval(env, eval_id).await?;
        let left = todo(&eval);
        if left == 0 || eval["status"] != "Running" {
            // The contract marks chunks InFlight in the same block it sends
            // the requests; they reach OutLayer a block or two later.
            let in_flight = eval["chunks"]
                .as_array()
                .unwrap()
                .iter()
                .filter(|c| c["state"] == "InFlight")
                .count();
            return wait_for(|| async move {
                Ok((pending_requests(env).await?.len() >= in_flight).then_some(()))
            })
            .await;
        }
        let _pending_callbacks = env
            .keeper
            .call(env.proctor.id(), "dispatch")
            .args_json(json!({"eval_id": eval_id.to_string()}))
            .gas(Gas::from_tgas(300))
            .transact_async()
            .await?;
        wait_for(|| async move { Ok((todo(&get_eval(env, eval_id).await?) < left).then_some(())) })
            .await?;
    }
}

async fn get_eval(env: &Env, eval_id: u64) -> anyhow::Result<Value> {
    Ok(env
        .proctor
        .view("get_eval")
        .args_json(json!({"eval_id": eval_id.to_string()}))
        .await?
        .json()?)
}

async fn balance(a: &Account) -> anyhow::Result<u128> {
    Ok(a.view_account().await?.balance.as_yoctonear())
}

fn chunk_items(job: &Value) -> u32 {
    (ITEMS - job["chunk"].as_u64().unwrap() as u32 * CHUNK).min(CHUNK)
}

/// Resolve every pending request with a correct, well-signed result.
async fn resolve_all_good(env: &Env, eval_id: u64) -> anyhow::Result<()> {
    for r in pending_requests(env).await? {
        let job = job_of(&r);
        resolve(
            env,
            eval_id,
            &r,
            Some(grader_output(
                &job,
                &env.model_key,
                all_right(chunk_items(&job)),
            )),
        )
        .await?;
    }
    Ok(())
}

#[tokio::test]
async fn certifies_an_eval_end_to_end_and_pays_the_author() -> anyhow::Result<()> {
    let env = setup().await?;
    let author_before = balance(&env.author).await?;
    let treasury_before = balance(&env.treasury).await?;

    let eval_id = request_eval(&env).await?;
    dispatch_all(&env, eval_id).await?;
    let requests = pending_requests(&env).await?;
    assert_eq!(requests.len(), 6, "3 chunks x 2 runs");
    let job = job_of(&requests[0]);
    assert_eq!(job["sealed_api_key"], "AQIDsealed");
    assert_eq!(job["max_tokens"], 4000);
    assert!(requests[0]["secrets_ref"]
        .as_str()
        .unwrap()
        .contains("scamset"));
    assert!(requests[0]["secrets_ref"]
        .as_str()
        .unwrap()
        .contains(env.author.id().as_str()));
    assert!(requests[0]["source"]
        .as_str()
        .unwrap()
        .contains(GRADER_HASH));
    assert_eq!(requests[0]["payer"], env.requester.id().as_str());

    for (i, r) in requests.iter().enumerate() {
        let job = job_of(r);
        // One false alarm in one chunk; everything else right.
        let conf = if i == 0 {
            (1, 1, 0, 0, 0)
        } else {
            all_right(chunk_items(&job))
        };
        resolve(
            &env,
            eval_id,
            r,
            Some(grader_output(&job, &env.model_key, conf)),
        )
        .await?;
    }

    let eval = get_eval(&env, eval_id).await?;
    assert_eq!(eval["status"], "Certified", "{eval:#}");
    assert_eq!(eval["escrow"], "0");
    let cert: Value = env
        .proctor
        .view("get_certificate")
        .args_json(json!({"eval_id": eval_id.to_string()}))
        .await?
        .json()?;
    assert_eq!(cert["model_id"], MODEL);
    assert_eq!(cert["set_commitment"], sha("the private set"));
    assert_eq!(cert["grader_hash"], GRADER_HASH);
    assert_eq!(cert["item_count"], ITEMS);
    assert_eq!(cert["runs"].as_array().unwrap().len(), 2);
    assert_eq!(cert["accuracy_max_bps"], 10000);
    assert_eq!(
        cert["accuracy_min_bps"], 8000,
        "one wrong answer out of 5 in one run"
    );
    assert_eq!(cert["accuracy_bps"], 9000);
    let listed: Vec<Value> = env
        .proctor
        .view("list_certificates")
        .args_json(json!({"set_id": SET}))
        .await?
        .json()?;
    assert_eq!(listed.len(), 1);

    let paid = |before: u128, a: &Account| {
        let a = a.clone();
        async move { anyhow::Ok(balance(&a).await? - before) }
    };
    wait_for(|| async { Ok((paid(author_before, &env.author).await? > 0).then_some(())) }).await?;
    // Exact shares, plus at most 0.001 NEAR of late gas refunds from the
    // accounts' own earlier transactions.
    let within = |gain: u128, share: u128| {
        gain >= share && gain - share < NearToken::from_millinear(1).as_yoctonear()
    };
    let author_gain = paid(author_before, &env.author).await?;
    let treasury_gain = paid(treasury_before, &env.treasury).await?;
    assert!(
        within(author_gain, NearToken::from_millinear(700).as_yoctonear()),
        "author got {author_gain}"
    );
    assert!(
        within(treasury_gain, NearToken::from_millinear(300).as_yoctonear()),
        "treasury got {treasury_gain}"
    );
    Ok(())
}

#[tokio::test]
async fn rejects_bad_results_then_accepts_a_retry() -> anyhow::Result<()> {
    let env = setup().await?;
    let eval_id = request_eval(&env).await?;
    dispatch_all(&env, eval_id).await?;
    let first = pending_requests(&env).await?[0].clone();
    let job = job_of(&first);
    let n = chunk_items(&job);
    let same_chunk =
        |r: &Value| job_of(r)["chunk"] == job["chunk"] && job_of(r)["nonce"] == job["nonce"];

    let other_key = SigningKey::from_bytes(&[7u8; 32]);
    let mut wrong_nonce = job.clone();
    wrong_nonce["nonce"] = json!("00".repeat(32));
    let bad = [
        (
            "signed by an unregistered key",
            grader_output(&job, &other_key, all_right(n)),
        ),
        (
            "result for another run",
            grader_output(&wrong_nonce, &env.model_key, all_right(n)),
        ),
    ];
    for (attempt, (why, out)) in bad.iter().enumerate() {
        let req = pending_requests(&env)
            .await?
            .into_iter()
            .find(same_chunk)
            .unwrap();
        resolve(&env, eval_id, &req, Some(out.clone())).await?;
        let eval = get_eval(&env, eval_id).await?;
        let i = chunk_index(&eval, &job);
        assert_eq!(
            eval["chunks"][i]["state"], "Failed",
            "{why}: {:#}",
            eval["chunks"][i]
        );
        assert_eq!(eval["chunks"][i]["attempts"], attempt as u64 + 1);
        assert_eq!(eval["status"], "Running");
        dispatch_all(&env, eval_id).await?;
    }
    // Third attempt is good; then the rest of the eval completes.
    resolve_all_good(&env, eval_id).await?;
    let eval = get_eval(&env, eval_id).await?;
    assert_eq!(eval["status"], "Certified", "{eval:#}");
    Ok(())
}

#[tokio::test]
async fn refuses_tampered_or_inconsistent_results() -> anyhow::Result<()> {
    let env = setup().await?;
    let eval_id = request_eval(&env).await?;
    dispatch_all(&env, eval_id).await?;
    let reqs = pending_requests(&env).await?;
    let job = job_of(&reqs[0]);
    let n = chunk_items(&job);
    let good: Value = serde_json::from_str(&grader_output(&job, &env.model_key, all_right(n)))?;

    let mut tampered = good.clone();
    tampered["output"]["answers"][0]["text"] = json!(format!("{MODEL}:{}:{}", sha("x"), sha("y")));
    let mut wrong_count = good.clone();
    wrong_count["output"]["confusion"]["tp"] = json!(n + 1);
    let mut hidden_unparsed = good.clone();
    hidden_unparsed["output"]["confusion"]["unparsed"] = json!(1);
    let mut repeated = good.clone();
    repeated["output"]["answers"][1] = repeated["output"]["answers"][0].clone();
    let mut other_model = good.clone();
    other_model["output"]["model"] = json!("deepseek/deepseek-v3.2");

    let cases = [
        ("tampered answer text", tampered.to_string()),
        ("counts that don't add up", wrong_count.to_string()),
        (
            "unparsed answers not counted as wrong",
            hidden_unparsed.to_string(),
        ),
        ("one answer used twice", repeated.to_string()),
        ("result for another model", other_model.to_string()),
        ("not JSON", "garbage".to_string()),
    ];
    // Use a different pending request for each case.
    assert!(reqs.len() >= cases.len());
    for ((why, out), req) in cases.iter().zip(reqs.iter()) {
        let mut out = out.clone();
        let this_job = job_of(req);
        if *why != "not JSON" {
            let mut v: Value = serde_json::from_str(&out)?;
            v["output"]["chunk"] = this_job["chunk"].clone();
            v["output"]["nonce"] = this_job["nonce"].clone();
            out = v.to_string();
        }
        resolve(&env, eval_id, req, Some(out)).await?;
        let eval = get_eval(&env, eval_id).await?;
        let i = chunk_index(&eval, &this_job);
        assert_eq!(
            eval["chunks"][i]["state"], "Failed",
            "{why} must be refused: {:#}",
            eval["chunks"][i]
        );
    }
    Ok(())
}

#[tokio::test]
async fn a_failed_eval_refunds_the_price() -> anyhow::Result<()> {
    let env = setup().await?;
    let eval_id = request_eval(&env).await?;
    dispatch_all(&env, eval_id).await?;
    let job = job_of(&pending_requests(&env).await?[0]);
    let before = balance(&env.requester).await?;
    for _ in 0..3 {
        let req = pending_requests(&env)
            .await?
            .into_iter()
            .find(|r| job_of(r)["chunk"] == job["chunk"] && job_of(r)["nonce"] == job["nonce"])
            .unwrap();
        let out =
            json!({"success": false, "output": null, "error": "NEAR AI unavailable"}).to_string();
        resolve(&env, eval_id, &req, Some(out)).await?;
        dispatch_all(&env, eval_id).await?;
    }
    let eval = get_eval(&env, eval_id).await?;
    assert_eq!(eval["status"], "Failed", "{eval:#}");
    assert_eq!(eval["escrow"], "0");
    wait_for(|| async {
        Ok((balance(&env.requester).await? > before + near(1).as_yoctonear()).then_some(()))
    })
    .await?;
    Ok(())
}

#[tokio::test]
async fn a_timed_out_job_is_retried() -> anyhow::Result<()> {
    let env = setup().await?;
    let eval_id = request_eval(&env).await?;
    // NEAR resumes an unanswered yield with an error after ~200 blocks.
    env.worker.fast_forward(250).await?;
    wait_for(|| async {
        let e = get_eval(&env, eval_id).await?;
        Ok(e["chunks"]
            .as_array()
            .unwrap()
            .iter()
            .any(|c| c["state"] == "Failed")
            .then_some(()))
    })
    .await?;
    let eval = get_eval(&env, eval_id).await?;
    let failed = eval["chunks"]
        .as_array()
        .unwrap()
        .iter()
        .find(|c| c["state"] == "Failed")
        .unwrap();
    assert!(
        failed["error"].as_str().unwrap().contains("timed out"),
        "{failed:#}"
    );
    dispatch_all(&env, eval_id).await?;
    let eval = get_eval(&env, eval_id).await?;
    assert!(
        eval["chunks"]
            .as_array()
            .unwrap()
            .iter()
            .any(|c| c["state"] == "InFlight" && c["attempts"] == 2),
        "{eval:#}"
    );
    Ok(())
}

#[tokio::test]
async fn enforces_the_eval_cap_and_payment() -> anyhow::Result<()> {
    let env = setup().await?;
    let under = try_request_eval(&env, Some(NearToken::from_millinear(500))).await?;
    assert!(
        under.unwrap_err().contains("attach at least"),
        "underpaying must fail"
    );
    assert_eq!(request_eval(&env).await?, 0);
    assert_eq!(request_eval(&env).await?, 1);
    let third = try_request_eval(&env, None).await?;
    assert!(third.unwrap_err().contains("eval cap reached"));
    Ok(())
}

#[tokio::test]
async fn only_the_right_accounts_can_act() -> anyhow::Result<()> {
    let env = setup().await?;
    let r = env
        .requester
        .call(env.proctor.id(), "register_model")
        .args_json(json!({"model_id": "evil/model", "signers": [sha("k")], "attestation_report_sha256": sha("r")}))
        .transact()
        .await?;
    assert!(r.is_failure(), "only the attester registers models");
    let cfg = config(
        env.outlayer.id().as_str(),
        env.requester.id().as_str(),
        env.requester.id().as_str(),
    );
    let r = env
        .requester
        .call(env.proctor.id(), "set_config")
        .args_json(json!({"config": cfg}))
        .transact()
        .await?;
    assert!(r.is_failure(), "only the owner changes config");
    let r = env
        .requester
        .call(env.proctor.id(), "on_chunk")
        .args_json(json!({"eval_id": "0", "index": 0, "attempt": 1}))
        .transact()
        .await?;
    assert!(r.is_failure(), "on_chunk is private");
    let r = env
        .requester
        .call(env.proctor.id(), "retire_set")
        .args_json(json!({"set_id": SET}))
        .transact()
        .await?;
    assert!(r.is_failure(), "only the author retires a set");
    assert!(env
        .attester
        .call(env.proctor.id(), "set_paused")
        .args_json(json!({"paused": true}))
        .transact()
        .await?
        .is_failure());
    assert!(env
        .owner
        .call(env.proctor.id(), "set_paused")
        .args_json(json!({"paused": true}))
        .transact()
        .await?
        .is_success());
    assert!(try_request_eval(&env, None)
        .await?
        .unwrap_err()
        .contains("paused"));
    Ok(())
}

/// The heaviest callback the contract can face: 40 signed answers in one
/// chunk of the largest eval it accepts (600 chunks), so the eval record it
/// rewrites is as big as it gets. It must fit `GAS_FOR_CALLBACK` (50 TGas)
/// with room to spare, and its event must fit NEAR's 16 KiB log limit.
#[tokio::test]
async fn the_worst_case_callback_fits_its_gas_and_log_limits() -> anyhow::Result<()> {
    let env = setup().await?;
    let per_run = 600 / RUNS as u32;
    let items = (per_run * 40).min(10_000);
    env.author
        .call(env.proctor.id(), "register_set")
        .args_json(json!({"set": {
            "set_id": "big", "title": "Largest set", "description": "",
            "commitment": sha("the private set"), "item_count": items, "chunk_size": 40,
            "max_tokens": 4000, "price": near(1).as_yoctonear().to_string(), "author_bps": 7000,
            "secrets_profile": "big", "eval_cap_per_model": 1,
        }}))
        .deposit(NearToken::from_millinear(100))
        .transact()
        .await?
        .into_result()?;
    let quote: String = env.proctor.view("quote_eval").args_json(json!({"set_id": "big"})).await?.json()?;
    let tx = env
        .requester
        .call(env.proctor.id(), "request_eval")
        .args_json(json!({"set_id": "big", "model_id": MODEL}))
        .deposit(NearToken::from_yoctonear(quote.parse::<u128>()? + 10u128.pow(23)))
        .gas(Gas::from_tgas(300))
        .transact_async()
        .await?;
    let requests = wait_for(|| async {
        let r = pending_requests(&env).await?;
        Ok((r.len() >= 2).then_some(r))
    })
    .await?;
    for r in &requests {
        let job = job_of(r);
        let answers: Vec<Value> = (0..40)
            .map(|i| {
                let text = format!("{MODEL}:{}:{}", sha(&format!("req {} {i} {}", job["chunk"], job["nonce"])), sha(&format!("resp {i}")));
                json!({"text": text, "signature": hex::encode(env.model_key.sign(text.as_bytes()).to_bytes())})
            })
            .collect();
        let out = json!({"success": true, "error": null, "output": {
            "set_id": "big", "model": MODEL, "chunk": job["chunk"], "nonce": job["nonce"],
            "set_commitment": sha("the private set"), "n": 40,
            "confusion": {"tp": 20, "fp": 0, "tn": 20, "fn_": 0, "unparsed": 0},
            "signer": hex::encode(env.model_key.verifying_key().to_bytes()),
            "answers": answers, "records_digest": sha("digest"),
        }})
        .to_string();
        env.keeper
            .call(env.outlayer.id(), "resolve")
            .args_json(json!({"request_id": r["id"], "output": out}))
            .max_gas()
            .transact()
            .await?
            .into_result()?;
    }
    wait_for(|| async {
        let e = get_eval(&env, 0).await?;
        let done = (0..2).filter(|i| e["chunks"][*i]["state"] == "Done").count();
        Ok((done == 2).then_some(()))
    })
    .await?;
    let outcome = wait_for(|| async {
        Ok(match tx.status().await? {
            std::task::Poll::Ready(o) => Some(o),
            std::task::Poll::Pending => None,
        })
    })
    .await?;
    let callbacks: Vec<_> = outcome
        .receipt_outcomes()
        .iter()
        .filter(|o| o.executor_id == *env.proctor.id() && o.logs.iter().any(|l| l.contains("chunk_accepted")))
        .collect();
    assert_eq!(callbacks.len(), 2, "both chunks accepted");
    for c in callbacks {
        let tgas = c.gas_burnt.as_tgas();
        let log = c.logs.iter().map(|l| l.len()).max().unwrap();
        println!("worst-case on_chunk: {tgas} TGas burnt, longest log {log} bytes");
        assert!(tgas <= 35, "on_chunk burnt {tgas} TGas; budget is 50");
        assert!(log < 16_384, "event of {log} bytes exceeds the log limit");
    }
    Ok(())
}
