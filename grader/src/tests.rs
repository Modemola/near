use super::*;
use ed25519_dalek::{Signer, SigningKey};
use std::cell::RefCell;
use std::collections::HashMap;

const MODEL: &str = "Qwen/Qwen3.8-27B";
const NONCE: &str = "ab12";

/// A fake NEAR AI Cloud that signs responses like the real one, with knobs to
/// misbehave.
/// Request and response bytes the mock signed, by chat id.
type Signed = HashMap<String, (Vec<u8>, Vec<u8>)>;

struct Mock {
    key: SigningKey,
    other_key: SigningKey,
    /// Answer per item text marker; unknown items get "LEGIT: fine".
    answers: HashMap<&'static str, Option<&'static str>>,
    signed: RefCell<Signed>,
    fail_completions: RefCell<usize>,
    tamper_signed_text: bool,
    sign_with_other_key: bool,
    gateway_signature: bool,
    report_nonce: &'static str,
    calls: RefCell<usize>,
}

impl Mock {
    fn new() -> Self {
        Mock {
            key: SigningKey::from_bytes(&[7u8; 32]),
            other_key: SigningKey::from_bytes(&[9u8; 32]),
            answers: HashMap::new(),
            signed: RefCell::new(HashMap::new()),
            fail_completions: RefCell::new(0),
            tamper_signed_text: false,
            sign_with_other_key: false,
            gateway_signature: false,
            report_nonce: NONCE,
            calls: RefCell::new(0),
        }
    }
    fn signer_hex(&self) -> String {
        hex::encode(self.key.verifying_key().to_bytes())
    }
}

fn ok(body: serde_json::Value) -> Result<Response, String> {
    Ok(Response {
        status: 200,
        body: serde_json::to_vec(&body).unwrap(),
    })
}

impl Http for Mock {
    fn get(&self, url: &str, _h: &[(&str, &str)]) -> Result<Response, String> {
        *self.calls.borrow_mut() += 1;
        if url.contains("/attestation/report") {
            return ok(serde_json::json!({"model_attestations": [{
                "signing_algo": "ed25519",
                "signing_address": self.signer_hex(),
                "request_nonce": self.report_nonce,
            }]}));
        }
        let id = url
            .rsplit('/')
            .next()
            .unwrap()
            .split('?')
            .next()
            .unwrap()
            .to_string();
        let (req, resp) = self
            .signed
            .borrow()
            .get(&id)
            .cloned()
            .ok_or("unknown chat id")?;
        let mut text = expected_signed_text(MODEL, &req, &resp);
        let key = if self.sign_with_other_key {
            &self.other_key
        } else {
            &self.key
        };
        let signature = hex::encode(key.sign(text.as_bytes()).to_bytes());
        if self.tamper_signed_text {
            text = expected_signed_text(MODEL, &req, b"something else");
        }
        ok(serde_json::json!({
            "text": text,
            "signature": signature,
            "signing_address": hex::encode(key.verifying_key().to_bytes()),
            "signing_algo": "ed25519",
            "signature_kind": if self.gateway_signature { "gateway" } else { "provider_tee" },
        }))
    }

    fn post(&self, _url: &str, _h: &[(&str, &str)], body: &[u8]) -> Result<Response, String> {
        *self.calls.borrow_mut() += 1;
        if *self.fail_completions.borrow() > 0 {
            *self.fail_completions.borrow_mut() -= 1;
            return Ok(Response {
                status: 503,
                body: b"busy".to_vec(),
            });
        }
        let req: serde_json::Value = serde_json::from_slice(body).unwrap();
        let user = req["messages"][1]["content"].as_str().unwrap().to_string();
        let content = self
            .answers
            .iter()
            .find(|(marker, _)| user.contains(*marker))
            .map(|(_, a)| *a)
            .unwrap_or(Some("LEGIT: fine"));
        let id = format!("chat-{}", self.signed.borrow().len());
        let resp = serde_json::to_vec(&serde_json::json!({
            "id": id,
            "choices": [{"message": {"content": content}, "finish_reason": if content.is_some() {"stop"} else {"length"}}],
        }))
        .unwrap();
        self.signed
            .borrow_mut()
            .insert(id, (body.to_vec(), resp.clone()));
        Ok(Response {
            status: 200,
            body: resp,
        })
    }
}

fn item(id: &str, text: &str, label: Label) -> Item {
    Item {
        id: id.into(),
        channel: "sms".into(),
        from: "+44 7700 900000".into(),
        text: text.into(),
        label,
    }
}

fn job(chunk: usize, chunk_size: usize) -> Job {
    Job {
        set_id: "set-1".into(),
        model: MODEL.into(),
        chunk,
        chunk_size,
        nonce: NONCE.into(),
        max_tokens: 4000,
    }
}

fn items() -> Vec<Item> {
    vec![
        item("a", "scam-caught", Label::Scam),
        item("b", "scam-missed", Label::Scam),
        item("c", "legit-ok", Label::Legit),
        item("d", "legit-flagged", Label::Legit),
        item("e", "no-answer", Label::Scam),
    ]
}

fn mock_with_answers() -> Mock {
    let mut m = Mock::new();
    m.answers.insert(
        "scam-caught",
        Some("<think>hmm, LEGIT? no</think>SCAM: asks for money"),
    );
    m.answers.insert("scam-missed", Some("LEGIT: looks normal"));
    m.answers
        .insert("legit-ok", Some("LEGIT: no request, not a SCAM"));
    m.answers.insert("legit-flagged", Some("SCAM: suspicious"));
    m.answers.insert("no-answer", None);
    m
}

#[test]
fn parses_labels_after_reasoning_and_ignores_lowercase() {
    assert_eq!(parse_label(Some("SCAM: gift cards")), Some(Label::Scam));
    assert_eq!(parse_label(Some("LEGIT: not a SCAM")), Some(Label::Legit));
    assert_eq!(
        parse_label(Some("<think>SCAM or LEGIT?</think>\n\nLEGIT: fine")),
        Some(Label::Legit)
    );
    assert_eq!(parse_label(Some("This is a SCAM.")), Some(Label::Scam));
    assert_eq!(parse_label(Some("scam: lowercase is not an answer")), None);
    assert_eq!(parse_label(Some("SCAMMER")), None);
    assert_eq!(parse_label(Some("")), None);
    assert_eq!(parse_label(None), None);
}

#[test]
fn request_bytes_are_stable_and_carry_only_message_fields() {
    let it = item("x", "hello", Label::Scam);
    let a = request_body(MODEL, 4000, &it);
    assert_eq!(a, request_body(MODEL, 4000, &it));
    let s = String::from_utf8(a).unwrap();
    assert!(s.contains("Channel: sms\\nFrom: +44 7700 900000\\nMessage:\\nhello"));
    assert!(!s.contains("\"x\""), "item id must not be sent");
    assert!(!s.contains("SCAM\","), "label must not be sent");
    assert!(s.contains("\"temperature\":0") && s.contains("\"stream\":false"));
}

#[test]
fn grades_a_chunk_and_counts_no_answer_as_wrong() {
    let m = mock_with_answers();
    let r = grade_chunk(&m, "k", &job(0, 10), &items()).unwrap();
    assert_eq!(r.n, 5);
    assert_eq!(r.nonce, NONCE);
    assert_eq!(r.set_commitment, set_commitment(&items()));
    assert_eq!(
        r.confusion,
        Confusion {
            tp: 1,
            fp: 1,
            tn: 1,
            fn_: 2,
            unparsed: 1
        }
    );
    assert_eq!(r.signer, m.signer_hex());
    assert_eq!(r.answers.len(), 5);
    for a in &r.answers {
        verify_ed25519(&r.signer, &a.signature, &a.text).unwrap();
        assert!(a.text.starts_with("Qwen/Qwen3.8-27B:"));
    }
}

#[test]
fn output_contains_no_item_content_or_labels() {
    let m = mock_with_answers();
    let r = grade_chunk(&m, "k", &job(0, 10), &items()).unwrap();
    let out = serde_json::to_string(&Envelope {
        success: true,
        output: Some(r),
        error: None,
    })
    .unwrap();
    for leak in [
        "scam-caught",
        "legit-flagged",
        "asks for money",
        "\"a\"",
        "SCAM:",
        "LEGIT:",
    ] {
        assert!(!out.contains(leak), "output leaks {leak}");
    }
}

#[test]
fn chunks_split_the_set_and_out_of_range_fails() {
    let m = mock_with_answers();
    assert_eq!(grade_chunk(&m, "k", &job(0, 2), &items()).unwrap().n, 2);
    assert_eq!(grade_chunk(&m, "k", &job(2, 2), &items()).unwrap().n, 1);
    assert!(grade_chunk(&m, "k", &job(3, 2), &items()).is_err());
    assert!(grade_chunk(&m, "k", &job(0, 0), &items()).is_err());
    assert!(grade_chunk(&m, "k", &job(usize::MAX, 2), &items()).is_err());
}

#[test]
fn digest_depends_on_every_answer() {
    let a = grade_chunk(&mock_with_answers(), "k", &job(0, 10), &items()).unwrap();
    let b = grade_chunk(&mock_with_answers(), "k", &job(0, 10), &items()).unwrap();
    assert_eq!(a.records_digest, b.records_digest);
    let mut changed = mock_with_answers();
    changed
        .answers
        .insert("legit-ok", Some("LEGIT: different wording"));
    let c = grade_chunk(&changed, "k", &job(0, 10), &items()).unwrap();
    assert_ne!(a.records_digest, c.records_digest);
}

#[test]
fn rejects_signed_text_that_does_not_match_the_bytes() {
    let mut m = mock_with_answers();
    m.tamper_signed_text = true;
    let e = grade_chunk(&m, "k", &job(0, 10), &items()).unwrap_err();
    assert!(e.contains("does not match"), "{e}");
}

#[test]
fn rejects_a_response_signed_by_an_unattested_key() {
    let mut m = mock_with_answers();
    m.sign_with_other_key = true;
    let e = grade_chunk(&m, "k", &job(0, 10), &items()).unwrap_err();
    assert!(e.contains("other than the attested"), "{e}");
}

#[test]
fn rejects_gateway_signatures() {
    let mut m = mock_with_answers();
    m.gateway_signature = true;
    let e = grade_chunk(&m, "k", &job(0, 10), &items()).unwrap_err();
    assert!(e.contains("not from the model TEE"), "{e}");
}

#[test]
fn rejects_an_attestation_for_another_nonce() {
    let mut m = mock_with_answers();
    m.report_nonce = "stale";
    let e = grade_chunk(&m, "k", &job(0, 10), &items()).unwrap_err();
    assert!(e.contains("bound to this nonce"), "{e}");
}

#[test]
fn retries_transient_errors_then_gives_up() {
    let m = mock_with_answers();
    *m.fail_completions.borrow_mut() = 2;
    assert!(grade_chunk(&m, "k", &job(0, 1), &items()).is_ok());
    let m = mock_with_answers();
    *m.fail_completions.borrow_mut() = 3;
    let e = grade_chunk(&m, "k", &job(0, 1), &items()).unwrap_err();
    assert!(e.contains("HTTP 503"), "{e}");
}

#[test]
fn verify_rejects_malformed_inputs() {
    let k = SigningKey::from_bytes(&[1u8; 32]);
    let pk = hex::encode(k.verifying_key().to_bytes());
    let sig = hex::encode(k.sign(b"hello").to_bytes());
    verify_ed25519(&pk, &sig, "hello").unwrap();
    verify_ed25519(&format!("0x{pk}"), &format!("0x{sig}"), "hello").unwrap();
    assert!(verify_ed25519(&pk, &sig, "hellO").is_err());
    assert!(verify_ed25519("zz", &sig, "hello").is_err());
    assert!(verify_ed25519(&pk[..10], &sig, "hello").is_err());
    assert!(verify_ed25519(&pk, &sig[..20], "hello").is_err());
}

#[test]
fn prompt_tells_models_details_are_placeholders() {
    assert!(SYSTEM_PROMPT.starts_with("You check messages for scams."));
    assert!(SYSTEM_PROMPT.contains("replaced with realistic placeholders"));
    assert!(SYSTEM_PROMPT.contains("still matter"));
    assert!(SYSTEM_PROMPT.ends_with("`LEGIT: <reason>`."));
}

#[test]
fn commitment_covers_order_text_and_labels() {
    let a = items();
    let base = set_commitment(&a);
    assert_eq!(base.len(), 64);
    let mut reordered = a.clone();
    reordered.swap(0, 1);
    assert_ne!(set_commitment(&reordered), base);
    let mut relabelled = a.clone();
    relabelled[0].label = Label::Legit;
    assert_ne!(set_commitment(&relabelled), base);
    let mut edited = a.clone();
    edited[0].text.push(' ');
    assert_ne!(set_commitment(&edited), base);
}

#[test]
fn commitment_matches_the_javascript_canonical_form() {
    // JSON.stringify([{id,channel,from,text,label}]) for this item, hashed with
    // SHA-256: the value the web app computes (see web/src/lib/commitment.test.ts).
    let tricky = vec![Item {
        id: "p-1".into(),
        channel: "sms".into(),
        from: "Mum (saved contact)".into(),
        text: "Line one\nnоrthfield 😀 \"quoted\" \\ tab\there".into(),
        label: Label::Scam,
    }];
    assert_eq!(set_commitment(&tricky), JS_COMMITMENT_OF_TRICKY);
}

/// Computed with Node: see web/src/lib/commitment.test.ts, which asserts the same value.
const JS_COMMITMENT_OF_TRICKY: &str =
    "6f1539f38a1105ba09e4d2c9620c748c49158b8eb64e4cdbb9efdf0bb0358685";
