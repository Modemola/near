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
fn quotes_price_plus_worst_case_job_deposits() {
    let p = setup();
    // 3 chunks x 2 runs x 3 attempts x 0.01 NEAR + 1 NEAR price.
    let expected =
        NearToken::from_near(1).as_yoctonear() + 18 * NearToken::from_millinear(10).as_yoctonear();
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
