use super::*;
use near_sdk::serde_json;
use near_sdk::test_utils::{accounts, VMContextBuilder};
use near_sdk::testing_env;

fn hex64(seed: &str) -> String {
    env::sha256(seed.as_bytes())
        .iter()
        .map(|b| format!("{b:02x}"))
        .collect()
}

fn config() -> Config {
    Config {
        outlayer: "outlayer.testnet".parse().unwrap(),
        grader_url: "https://grader.example.com/g.wasm".into(),
        grader_hash: hex64("grader"),
        sealed_api_key: "sealed".into(),
        job_deposit: U128(NearToken::from_millinear(10).as_yoctonear()),
        max_execution_seconds: 180,
        runs_per_eval: 2,
        treasury: accounts(5),
        attester: accounts(1),
    }
}

fn context(predecessor: AccountId, deposit: NearToken) {
    testing_env!(VMContextBuilder::new()
        .current_account_id("proctor.testnet".parse().unwrap())
        .predecessor_account_id(predecessor)
        .attached_deposit(deposit)
        .prepaid_gas(Gas::from_tgas(300))
        .build());
}

fn new_set() -> NewTestSet {
    NewTestSet {
        set_id: "scam-v1".into(),
        title: "Scam set".into(),
        description: "".into(),
        commitment: hex64("set"),
        item_count: 5,
        chunk_size: 2,
        max_tokens: 4000,
        price: U128(NearToken::from_near(1).as_yoctonear()),
        author_bps: 7000,
        secrets_profile: "scamset".into(),
        eval_cap_per_model: 2,
    }
}

fn setup() -> Proctor {
    context(accounts(0), NearToken::from_yoctonear(0));
    let mut p = Proctor::new(accounts(0), config());
    context(accounts(1), NearToken::from_yoctonear(0));
    p.register_model(
        "Qwen/Qwen3.8-27B".into(),
        vec![hex64("key")],
        hex64("report"),
    );
    context(accounts(2), NearToken::from_near(1));
    p.register_set(new_set());
    p
}

#[test]
fn first_eval_is_within_the_cap() {
    let mut p = setup();
    assert_eq!(
        p.evals_started("scam-v1".into(), "Qwen/Qwen3.8-27B".into()),
        0
    );
    context(accounts(3), NearToken::from_near(5));
    let id = p.request_eval("scam-v1".into(), "Qwen/Qwen3.8-27B".into());
    assert_eq!(id.0, 0);
    assert_eq!(
        p.evals_started("scam-v1".into(), "Qwen/Qwen3.8-27B".into()),
        1
    );
    let eval = p.get_eval(id).unwrap();
    assert_eq!(eval.chunks.len(), 6);
    assert_eq!(eval.nonces.len(), 2);
    assert_ne!(eval.nonces[0], eval.nonces[1]);
}

fn signed_output(key: &ed25519_dalek::SigningKey, chunk: u32, n: u32, nonce: &str) -> String {
    use ed25519_dalek::Signer;
    let answers: Vec<_> = (0..n)
        .map(|i| {
            let text = format!("Qwen/Qwen3.8-27B:{}:{}", hex64(&format!("q{chunk}{i}")), hex64(&format!("a{i}")));
            serde_json::json!({"text": text, "signature": hex::encode(key.sign(text.as_bytes()).to_bytes())})
        })
        .collect();
    serde_json::json!({"success": true, "error": null, "output": {
        "set_id": "scam-v1", "model": "Qwen/Qwen3.8-27B", "chunk": chunk, "nonce": nonce, "n": n,
        "set_commitment": hex64("set"),
        "confusion": {"tp": n, "fp": 0, "tn": 0, "fn_": 0, "unparsed": 0},
        "signer": hex::encode(key.verifying_key().to_bytes()),
        "attestation_report_sha256": hex64("r"), "answers": answers, "records_digest": hex64("d"),
    }})
    .to_string()
}

fn model_for(key: &ed25519_dalek::SigningKey) -> Model {
    Model {
        model_id: "Qwen/Qwen3.8-27B".into(),
        signers: vec![hex::encode(key.verifying_key().to_bytes())],
        attestation_report_sha256: hex64("r"),
        registered_at: U64(0),
    }
}

fn stored_set() -> TestSet {
    let n = new_set();
    TestSet {
        set_id: n.set_id,
        author: accounts(2),
        title: n.title,
        description: n.description,
        commitment: n.commitment,
        item_count: n.item_count,
        chunk_size: n.chunk_size,
        max_tokens: n.max_tokens,
        price: n.price,
        author_bps: n.author_bps,
        secrets_profile: n.secrets_profile,
        eval_cap_per_model: n.eval_cap_per_model,
        active: true,
        created_at: U64(0),
    }
}

#[test]
fn accepts_a_full_and_a_partial_last_chunk() {
    context(accounts(0), NearToken::from_yoctonear(0));
    let key = ed25519_dalek::SigningKey::from_bytes(&[3u8; 32]);
    let (set, model) = (stored_set(), model_for(&key));
    // 5 items in chunks of 2: chunks 0 and 1 hold 2, chunk 2 holds 1.
    assert!(validate::check_chunk(&signed_output(&key, 0, 2, "n1"), &set, &model, "n1", 0).is_ok());
    assert!(validate::check_chunk(&signed_output(&key, 2, 1, "n1"), &set, &model, "n1", 2).is_ok());
    let e =
        validate::check_chunk(&signed_output(&key, 2, 2, "n1"), &set, &model, "n1", 2).unwrap_err();
    assert!(e.contains("expected 1"), "{e}");
    let e =
        validate::check_chunk(&signed_output(&key, 3, 1, "n1"), &set, &model, "n1", 3).unwrap_err();
    assert!(e.contains("out of range") || e.contains("expected"), "{e}");
}

#[test]
fn rejects_a_result_for_another_chunk_or_run() {
    context(accounts(0), NearToken::from_yoctonear(0));
    let key = ed25519_dalek::SigningKey::from_bytes(&[3u8; 32]);
    let (set, model) = (stored_set(), model_for(&key));
    let out = signed_output(&key, 0, 2, "n1");
    assert!(validate::check_chunk(&out, &set, &model, "n2", 0).is_err());
    assert!(validate::check_chunk(&out, &set, &model, "n1", 1).is_err());
}

#[test]
fn rejects_grader_errors_and_success_without_output() {
    context(accounts(0), NearToken::from_yoctonear(0));
    let key = ed25519_dalek::SigningKey::from_bytes(&[3u8; 32]);
    let (set, model) = (stored_set(), model_for(&key));
    let e = validate::check_chunk(
        r#"{"success":false,"output":null,"error":"boom"}"#,
        &set,
        &model,
        "n",
        0,
    )
    .unwrap_err();
    assert!(e.contains("boom"));
    assert!(validate::check_chunk(
        r#"{"success":true,"output":null,"error":null}"#,
        &set,
        &model,
        "n",
        0
    )
    .is_err());
}

#[test]
#[should_panic(expected = "commitment must be lowercase hex")]
fn refuses_a_set_with_a_bad_commitment() {
    let mut p = setup();
    context(accounts(2), NearToken::from_near(1));
    p.register_set(NewTestSet {
        set_id: "other".into(),
        commitment: "ABC".into(),
        ..new_set()
    });
}

#[test]
#[should_panic(expected = "author share above 100%")]
fn refuses_an_author_share_above_100_percent() {
    let mut p = setup();
    context(accounts(2), NearToken::from_near(1));
    p.register_set(NewTestSet {
        set_id: "other".into(),
        author_bps: 10_001,
        ..new_set()
    });
}

#[test]
#[should_panic(expected = "set id taken")]
fn refuses_a_duplicate_set_id() {
    let mut p = setup();
    context(accounts(2), NearToken::from_near(1));
    p.register_set(new_set());
}

#[test]
fn quotes_price_worst_case_job_deposits_and_storage() {
    let p = setup();
    // 1 NEAR price + 3 chunks x 2 runs x 3 attempts x 0.01 NEAR, plus storage
    // for 6 chunks' final states and the certificate.
    let storage = env::storage_byte_cost().as_yoctonear() * u128::from(6 * STORAGE_PER_CHUNK + STORAGE_FOR_CERTIFICATE);
    let expected =
        NearToken::from_near(1).as_yoctonear() + 18 * NearToken::from_millinear(10).as_yoctonear() + storage;
    assert_eq!(p.quote_eval("scam-v1".into()).0, expected);
}

#[test]
#[should_panic(expected = "grader key not sealed yet")]
fn refuses_evals_before_the_key_is_sealed() {
    context(accounts(0), NearToken::from_yoctonear(0));
    let mut p = Proctor::new(
        accounts(0),
        Config {
            sealed_api_key: "".into(),
            ..config()
        },
    );
    context(accounts(1), NearToken::from_yoctonear(0));
    p.register_model(
        "Qwen/Qwen3.8-27B".into(),
        vec![hex64("key")],
        hex64("report"),
    );
    context(accounts(2), NearToken::from_near(1));
    p.register_set(new_set());
    context(accounts(3), NearToken::from_near(5));
    p.request_eval("scam-v1".into(), "Qwen/Qwen3.8-27B".into());
}

#[test]
fn an_accepted_chunk_emits_its_signed_answers() {
    let key = ed25519_dalek::SigningKey::from_bytes(&[3u8; 32]);
    context(accounts(0), NearToken::from_yoctonear(0));
    let mut p = Proctor::new(accounts(0), config());
    context(accounts(1), NearToken::from_yoctonear(0));
    let m = model_for(&key);
    p.register_model(m.model_id, m.signers, m.attestation_report_sha256);
    context(accounts(2), NearToken::from_near(1));
    p.register_set(new_set());
    context(accounts(3), NearToken::from_near(5));
    let id = p.request_eval("scam-v1".into(), "Qwen/Qwen3.8-27B".into());
    let eval = p.get_eval(id).unwrap();
    assert!(matches!(eval.chunks[0], ChunkState::InFlight { attempts: 1, .. }));

    context(
        "proctor.testnet".parse().unwrap(),
        NearToken::from_yoctonear(0),
    );
    let out = signed_output(&key, 0, 2, &eval.nonces[0]);
    assert!(p.on_chunk(id, 0, 1, Ok(Some(out))));

    let logs = near_sdk::test_utils::get_logs();
    let event = logs
        .iter()
        .find_map(|l| l.strip_prefix("EVENT_JSON:"))
        .map(|j| serde_json::from_str::<serde_json::Value>(j).unwrap())
        .expect("an event");
    assert_eq!(event["standard"], "proctor");
    assert_eq!(event["event"], "chunk_accepted");
    let data = &event["data"][0];
    assert_eq!(data["eval_id"], "0");
    assert_eq!(data["nonce"], eval.nonces[0].as_str());
    assert_eq!(data["answers"].as_array().unwrap().len(), 2);
    // Compact answers: the signed text is "<model>:<req>:<resp>", and it verifies.
    let a = &data["answers"][0];
    let text = format!("Qwen/Qwen3.8-27B:{}:{}", a["req"].as_str().unwrap(), a["resp"].as_str().unwrap());
    let sig: [u8; 64] = hex::decode(a["sig"].as_str().unwrap()).unwrap().try_into().unwrap();
    assert!(env::ed25519_verify(&sig, text.as_bytes(), &key.verifying_key().to_bytes()));
    assert!(matches!(
        p.get_eval(id).unwrap().chunks[0],
        ChunkState::Done { .. }
    ));

    // The same result delivered again is ignored.
    context(
        "proctor.testnet".parse().unwrap(),
        NearToken::from_yoctonear(0),
    );
    assert!(!p.on_chunk(
        id,
        0,
        1,
        Ok(Some(signed_output(&key, 0, 2, &eval.nonces[0])))
    ));
}

#[test]
fn rejects_a_sealed_set_that_differs_from_its_commitment() {
    context(accounts(0), NearToken::from_yoctonear(0));
    let key = ed25519_dalek::SigningKey::from_bytes(&[3u8; 32]);
    let (set, model) = (stored_set(), model_for(&key));
    let mut v: serde_json::Value = serde_json::from_str(&signed_output(&key, 0, 2, "n1")).unwrap();
    v["output"]["set_commitment"] = serde_json::json!(hex64("a different set"));
    let e = validate::check_chunk(&v.to_string(), &set, &model, "n1", 0).unwrap_err();
    assert!(e.contains("commitment"), "{e}");
}


fn context_at(predecessor: AccountId, deposit: NearToken, height: u64) {
    testing_env!(VMContextBuilder::new()
        .current_account_id("proctor.testnet".parse().unwrap())
        .predecessor_account_id(predecessor.clone())
        .signer_account_id(predecessor)
        .attached_deposit(deposit)
        .prepaid_gas(Gas::from_tgas(300))
        .block_index(height)
        .build());
}

/// A contract with a model keyed to `key` and one running eval (id 0).
fn running_eval(key: &ed25519_dalek::SigningKey) -> Proctor {
    context_at(accounts(0), NearToken::from_yoctonear(0), 100);
    let mut p = Proctor::new(accounts(0), config());
    context_at(accounts(1), NearToken::from_yoctonear(0), 100);
    let m = model_for(key);
    p.register_model(m.model_id, m.signers, m.attestation_report_sha256);
    context_at(accounts(2), NearToken::from_near(1), 100);
    p.register_set(new_set());
    let quote = p.quote_eval("scam-v1".into()).0;
    context_at(accounts(3), NearToken::from_yoctonear(quote + 10u128.pow(22)), 100);
    p.request_eval("scam-v1".into(), "Qwen/Qwen3.8-27B".into());
    p
}

#[test]
fn quote_covers_storage_and_dispatch_records_who_and_when() {
    let key = ed25519_dalek::SigningKey::from_bytes(&[3u8; 32]);
    let p = running_eval(&key);
    let eval = p.get_eval(U64(0)).unwrap();
    match &eval.chunks[0] {
        ChunkState::InFlight { attempts, since, by } => {
            assert_eq!((*attempts, since.0, by.clone()), (1, 100, accounts(3)));
        }
        other => panic!("{other:?}"),
    }
}

#[test]
fn a_lost_callback_is_retried_and_its_late_result_ignored() {
    let key = ed25519_dalek::SigningKey::from_bytes(&[3u8; 32]);
    let mut p = running_eval(&key);
    let nonce = p.get_eval(U64(0)).unwrap().nonces[0].clone();

    // Too early: nothing to retry, chunk 0 stays in flight.
    context_at(accounts(4), NearToken::from_yoctonear(0), 100 + STALE_AFTER_BLOCKS - 1);
    p.dispatch(U64(0));
    assert!(matches!(p.get_eval(U64(0)).unwrap().chunks[0], ChunkState::InFlight { attempts: 1, .. }));

    // After the timeout, dispatch retries it as attempt 2.
    context_at(accounts(4), NearToken::from_yoctonear(0), 100 + STALE_AFTER_BLOCKS);
    p.dispatch(U64(0));
    assert!(matches!(p.get_eval(U64(0)).unwrap().chunks[0], ChunkState::InFlight { attempts: 2, .. }));

    // The first attempt's result, arriving late, is ignored.
    context("proctor.testnet".parse().unwrap(), NearToken::from_yoctonear(0));
    assert!(!p.on_chunk(U64(0), 0, 1, Ok(Some(signed_output(&key, 0, 2, &nonce)))));
    // The retry's result is accepted.
    context("proctor.testnet".parse().unwrap(), NearToken::from_yoctonear(0));
    assert!(p.on_chunk(U64(0), 0, 2, Ok(Some(signed_output(&key, 0, 2, &nonce)))));
}

#[test]
fn a_chunk_lost_on_every_attempt_fails_the_eval_and_frees_the_cap() {
    let key = ed25519_dalek::SigningKey::from_bytes(&[3u8; 32]);
    let mut p = running_eval(&key);
    assert_eq!(p.evals_started("scam-v1".into(), "Qwen/Qwen3.8-27B".into()), 1);
    let mut height = 100;
    for _ in 0..MAX_ATTEMPTS {
        height += STALE_AFTER_BLOCKS;
        context_at(accounts(4), NearToken::from_yoctonear(0), height);
        p.dispatch(U64(0));
    }
    let eval = p.get_eval(U64(0)).unwrap();
    assert_eq!(eval.status, EvalStatus::Failed);
    assert_eq!(eval.escrow.0, 0, "escrow refunded");
    assert_eq!(p.evals_started("scam-v1".into(), "Qwen/Qwen3.8-27B".into()), 0, "cap freed");
}

#[test]
fn a_huge_grader_error_is_cut_short() {
    let key = ed25519_dalek::SigningKey::from_bytes(&[3u8; 32]);
    let mut p = running_eval(&key);
    let out = serde_json::json!({"success": false, "output": null, "error": "é".repeat(5_000)}).to_string();
    context("proctor.testnet".parse().unwrap(), NearToken::from_yoctonear(0));
    assert!(!p.on_chunk(U64(0), 0, 1, Ok(Some(out))));
    match &p.get_eval(U64(0)).unwrap().chunks[0] {
        ChunkState::Failed { error, .. } => assert!(error.len() <= MAX_ERROR_LEN + 4, "{}", error.len()),
        other => panic!("{other:?}"),
    }
}

#[test]
fn overflowing_counts_are_rejected_not_panicked_on() {
    context(accounts(0), NearToken::from_yoctonear(0));
    let key = ed25519_dalek::SigningKey::from_bytes(&[3u8; 32]);
    let mut v: serde_json::Value = serde_json::from_str(&signed_output(&key, 0, 2, "n1")).unwrap();
    v["output"]["confusion"] = serde_json::json!({"tp": u32::MAX, "fp": 3, "tn": 0, "fn_": 0, "unparsed": 0});
    let e = validate::check_chunk(&v.to_string(), &stored_set(), &model_for(&key), "n1", 0).unwrap_err();
    assert!(e.contains("expected"), "{e}");
}

#[test]
fn unreadable_output_fails_the_attempt_without_panicking() {
    let key = ed25519_dalek::SigningKey::from_bytes(&[3u8; 32]);
    let mut p = running_eval(&key);
    context("proctor.testnet".parse().unwrap(), NearToken::from_yoctonear(0));
    assert!(!p.on_chunk(U64(0), 0, 1, Ok(Some("not json at all".into()))));
    assert!(matches!(p.get_eval(U64(0)).unwrap().chunks[0], ChunkState::Failed { attempts: 1, .. }));
}
