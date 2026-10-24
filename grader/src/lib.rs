//! Proctor grader: grades one chunk of a private test set against a NEAR AI
//! Cloud TEE model and reports only aggregate counts.
//!
//! The logic here is pure and tested offline; network access goes through the
//! [`Http`] trait so the WASI binary and the tests can supply their own.

use ed25519_dalek::{Signature, Verifier, VerifyingKey};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};

pub const NEARAI_BASE: &str = "https://cloud-api.near.ai/v1";

/// The fixed instruction every model gets, from `prompt.txt` (shared with the
/// audit scripts). Compiled in, so the grader's build hash pins it.
pub const SYSTEM_PROMPT: &str = include_str!("../prompt.txt");

/// How many times a failed HTTP call is retried before the chunk fails.
const RETRIES: usize = 3;
/// How many times a not-yet-recorded signature is polled for.
const SIGNATURE_POLLS: usize = 6;

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "UPPERCASE")]
pub enum Label {
    Scam,
    Legit,
}

/// One test item, as stored in the sealed test set. Only `channel`, `from`
/// and `text` are ever sent to a model.
#[derive(Clone, Debug, Deserialize)]
pub struct Item {
    pub id: String,
    pub channel: String,
    pub from: String,
    pub text: String,
    pub label: Label,
}

/// What the caller asks the grader to do: one chunk of one set, on one model.
#[derive(Clone, Debug, Deserialize)]
pub struct Job {
    pub set_id: String,
    pub model: String,
    pub chunk: usize,
    pub chunk_size: usize,
    /// Fresh per eval; binds the model's attestation report to this run.
    pub nonce: String,
    pub max_tokens: u32,
}

#[derive(Clone, Copy, Debug, Default, PartialEq, Eq, Serialize)]
pub struct Confusion {
    pub tp: u32,
    pub fp: u32,
    pub tn: u32,
    pub fn_: u32,
    /// Answers with no readable label (including running out of tokens).
    /// Already counted as wrong in the four counts above.
    pub unparsed: u32,
}

impl Confusion {
    pub fn record(&mut self, truth: Label, predicted: Option<Label>) {
        match (truth, predicted) {
            (Label::Scam, Some(Label::Scam)) => self.tp += 1,
            (Label::Legit, Some(Label::Legit)) => self.tn += 1,
            (Label::Scam, Some(Label::Legit)) => self.fn_ += 1,
            (Label::Legit, Some(Label::Scam)) => self.fp += 1,
            (Label::Scam, None) => {
                self.fn_ += 1;
                self.unparsed += 1
            }
            (Label::Legit, None) => {
                self.fp += 1;
                self.unparsed += 1
            }
        }
    }
}

/// The signed statement for one answer: NEAR AI's `provider_tee` text and its
/// Ed25519 signature, both hex/plain as NEAR AI returns them. The contract
/// re-verifies these on-chain.
#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
pub struct SignedAnswer {
    pub text: String,
    pub signature: String,
}

/// Everything that leaves the enclave for one chunk. No item content, no
/// per-item correctness.
#[derive(Clone, Debug, Serialize)]
pub struct ChunkResult {
    pub set_id: String,
    pub model: String,
    pub chunk: usize,
    /// The run's nonce, echoed so the contract can tie the result to the run
    /// it dispatched; the attestation report was fetched with it.
    pub nonce: String,
    /// [`set_commitment`] of the whole sealed set this run decrypted.
    pub set_commitment: String,
    pub n: u32,
    pub confusion: Confusion,
    /// The model's Ed25519 signing key (hex) from its attestation report.
    pub signer: String,
    pub attestation_report_sha256: String,
    pub answers: Vec<SignedAnswer>,
    /// SHA-256 chain over the per-item answer records, in item order.
    pub records_digest: String,
}

/// The grader's stdout. OutLayer adds no envelope, so the grader provides one.
#[derive(Debug, Serialize)]
pub struct Envelope {
    pub success: bool,
    pub output: Option<ChunkResult>,
    pub error: Option<String>,
}

pub struct Response {
    pub status: u16,
    pub body: Vec<u8>,
}

pub trait Http {
    fn get(&self, url: &str, headers: &[(&str, &str)]) -> Result<Response, String>;
    fn post(&self, url: &str, headers: &[(&str, &str)], body: &[u8]) -> Result<Response, String>;
    /// Wait between retries. A no-op in tests.
    fn pause(&self, _attempt: usize) {}
}

/// The set's commitment: SHA-256 (hex) of the items as a compact JSON array of
/// `{"id","channel","from","text","label"}` objects, in set order. The web
/// app computes the same bytes with `JSON.stringify` before the author
/// registers the set; the grader recomputes it on the sealed set so the
/// contract can check they match.
pub fn set_commitment(items: &[Item]) -> String {
    #[derive(Serialize)]
    struct Canon<'a> {
        id: &'a str,
        channel: &'a str,
        from: &'a str,
        text: &'a str,
        label: Label,
    }
    let canon: Vec<Canon> = items
        .iter()
        .map(|i| Canon {
            id: &i.id,
            channel: &i.channel,
            from: &i.from,
            text: &i.text,
            label: i.label,
        })
        .collect();
    sha256_hex(&serde_json::to_vec(&canon).expect("items serialise"))
}

pub fn sha256_hex(bytes: &[u8]) -> String {
    hex::encode(Sha256::digest(bytes))
}

pub fn user_content(item: &Item) -> String {
    format!(
        "Channel: {}\nFrom: {}\nMessage:\n{}",
        item.channel, item.from, item.text
    )
}

/// The exact request bytes for one item. Built once and hashed as sent, so the
/// signature check covers what the model actually received.
pub fn request_body(model: &str, max_tokens: u32, item: &Item) -> Vec<u8> {
    #[derive(Serialize)]
    struct Message<'a> {
        role: &'a str,
        content: &'a str,
    }
    #[derive(Serialize)]
    struct Body<'a> {
        model: &'a str,
        temperature: u8,
        max_tokens: u32,
        stream: bool,
        messages: [Message<'a>; 2],
    }
    let content = user_content(item);
    serde_json::to_vec(&Body {
        model,
        temperature: 0,
        max_tokens,
        stream: false,
        messages: [
            Message {
                role: "system",
                content: SYSTEM_PROMPT,
            },
            Message {
                role: "user",
                content: &content,
            },
        ],
    })
    .expect("request serialises")
}

/// The label in a model's answer, read strictly so that credit is only ever
/// given for a clear verdict (see `label-cases.json`):
///
/// 1. Reasoning is ignored: only text after the last `</think>` counts, and a
///    reasoning block that never closed (the token budget ran out) means no
///    answer.
/// 2. A line that starts with `SCAM` or `LEGIT` (after markdown such as `**`,
///    `` ` `` or `>`) is the verdict, as the prompt asks; the first such line wins.
/// 3. Otherwise the answer counts only if exactly one of the two words appears.
///    A reply that mentions both ("not a SCAM. LEGIT") is ambiguous.
///
/// Words are maximal runs of ASCII letters and digits, uppercase only.
/// `None` is scored as wrong.
pub fn parse_label(content: Option<&str>) -> Option<Label> {
    let content = content?;
    let answer = match content.rfind("</think>") {
        Some(end) => &content[end + "</think>".len()..],
        None if content.contains("<think>") => return None,
        None => content,
    };
    let word = |w: &str| match w {
        "SCAM" => Some(Label::Scam),
        "LEGIT" => Some(Label::Legit),
        _ => None,
    };
    let words = |s: &str| -> Vec<Label> {
        s.split(|c: char| !c.is_ascii_alphanumeric())
            .filter_map(word)
            .collect()
    };
    for line in answer.lines() {
        let line = line.trim_start_matches(|c: char| c.is_whitespace() || "*_`>#-\"'".contains(c));
        let first = line.split(|c: char| !c.is_ascii_alphanumeric()).next().unwrap_or("");
        if let Some(label) = word(first) {
            return Some(label);
        }
    }
    let found = words(answer);
    match found.first() {
        Some(&first) if found.iter().all(|l| *l == first) => Some(first),
        _ => None,
    }
}

/// The text NEAR AI signs for a `provider_tee` response.
pub fn expected_signed_text(model: &str, request: &[u8], response: &[u8]) -> String {
    format!("{model}:{}:{}", sha256_hex(request), sha256_hex(response))
}

/// Check an Ed25519 signature given as hex over `text`, with the hex public key.
pub fn verify_ed25519(signer_hex: &str, signature_hex: &str, text: &str) -> Result<(), String> {
    let key: [u8; 32] = hex::decode(signer_hex.trim_start_matches("0x"))
        .map_err(|_| "signer is not hex")?
        .try_into()
        .map_err(|_| "signer is not 32 bytes")?;
    let sig: [u8; 64] = hex::decode(signature_hex.trim_start_matches("0x"))
        .map_err(|_| "signature is not hex")?
        .try_into()
        .map_err(|_| "signature is not 64 bytes")?;
    VerifyingKey::from_bytes(&key)
        .map_err(|_| "signer is not a valid Ed25519 key")?
        .verify(text.as_bytes(), &Signature::from_bytes(&sig))
        .map_err(|_| "signature does not verify".to_string())
}

fn with_retries<T>(http: &dyn Http, mut f: impl FnMut() -> Result<T, String>) -> Result<T, String> {
    let mut last = String::new();
    for attempt in 0..RETRIES {
        match f() {
            Ok(v) => return Ok(v),
            Err(e) => last = e,
        }
        http.pause(attempt);
    }
    Err(last)
}

fn json(resp: &Response) -> Result<serde_json::Value, String> {
    serde_json::from_slice(&resp.body).map_err(|e| format!("bad JSON from NEAR AI: {e}"))
}

/// Fetch the model's attestation report bound to `nonce` and return its
/// Ed25519 signing key and the report's hash.
pub fn model_signer(http: &dyn Http, key: &str, job: &Job) -> Result<(String, String), String> {
    let auth = format!("Bearer {key}");
    let url = format!(
        "{NEARAI_BASE}/attestation/report?model={}&signing_algo=ed25519&provider=near&nonce={}",
        job.model.replace('/', "%2F"),
        job.nonce
    );
    let resp = with_retries(http, || {
        let r = http.get(&url, &[("Authorization", &auth), ("x-no-aliasing", "true")])?;
        if r.status == 200 {
            Ok(r)
        } else {
            Err(format!("attestation report: HTTP {}", r.status))
        }
    })?;
    let report = json(&resp)?;
    let candidates = report["model_attestations"]
        .as_array()
        .ok_or("no model attestations")?;
    let mut signers = candidates
        .iter()
        .filter(|c| c["signing_algo"] == "ed25519")
        .filter_map(|c| {
            if c["request_nonce"].as_str() != Some(job.nonce.as_str()) {
                return None;
            }
            c["signing_address"]
                .as_str()
                .map(|s| s.trim_start_matches("0x").to_lowercase())
        });
    let signer = signers
        .next()
        .ok_or("no Ed25519 model attestation bound to this nonce")?;
    if signers.any(|s| s != signer) {
        return Err("model attestations name more than one signer".into());
    }
    Ok((signer, sha256_hex(&resp.body)))
}

/// One graded item: the parsed label, the signed statement, and the record
/// hash that feeds [`ChunkResult::records_digest`].
pub type GradedItem = (Option<Label>, SignedAnswer, [u8; 32]);

/// Ask the model about one item and check NEAR AI's signature over the exact
/// bytes. Returns the parsed label and the signed statement.
pub fn grade_item(
    http: &dyn Http,
    key: &str,
    job: &Job,
    signer: &str,
    item: &Item,
) -> Result<GradedItem, String> {
    let auth = format!("Bearer {key}");
    let headers = [
        ("Authorization", auth.as_str()),
        ("Content-Type", "application/json"),
        ("x-no-aliasing", "true"),
        ("Accept-Encoding", "identity"),
    ];
    let request = request_body(&job.model, job.max_tokens, item);
    let resp = with_retries(http, || {
        let r = http.post(
            &format!("{NEARAI_BASE}/chat/completions"),
            &headers,
            &request,
        )?;
        if r.status == 200 {
            Ok(r)
        } else {
            Err(format!("completion: HTTP {}", r.status))
        }
    })?;
    let body = json(&resp)?;
    let chat_id = body["id"]
        .as_str()
        .ok_or("completion without id")?
        .to_string();
    let content = body["choices"][0]["message"]["content"].as_str();
    let label = parse_label(content);

    let sig_url = format!("{NEARAI_BASE}/signature/{chat_id}?signing_algo=ed25519");
    let mut sig = None;
    for attempt in 0..SIGNATURE_POLLS {
        let r = http.get(&sig_url, &[("Authorization", &auth)])?;
        if r.status == 200 {
            let v = json(&r)?;
            if v["signature"].is_string() {
                sig = Some(v);
                break;
            }
        }
        http.pause(attempt);
    }
    let sig = sig.ok_or("signature unavailable")?;
    if sig["signature_kind"] != "provider_tee" {
        return Err(format!(
            "signature is not from the model TEE: {}",
            sig["signature_kind"]
        ));
    }
    let text = sig["text"].as_str().ok_or("signature without text")?;
    if text != expected_signed_text(&job.model, &request, &resp.body) {
        return Err("signed text does not match the request and response bytes".into());
    }
    let sig_signer = sig["signing_address"]
        .as_str()
        .unwrap_or("")
        .trim_start_matches("0x")
        .to_lowercase();
    if sig_signer != signer {
        return Err("response signed by a key other than the attested one".into());
    }
    let signature = sig["signature"]
        .as_str()
        .ok_or("signature missing")?
        .trim_start_matches("0x")
        .to_string();
    verify_ed25519(signer, &signature, text)?;

    let record: [u8; 32] = Sha256::digest(format!("{text}|{signature}").as_bytes()).into();
    Ok((
        label,
        SignedAnswer {
            text: text.to_string(),
            signature,
        },
        record,
    ))
}

/// Grade one chunk. Any infrastructure failure fails the whole chunk (so the
/// contract can retry it); a model that gives no usable answer is scored wrong.
pub fn grade_chunk(
    http: &dyn Http,
    key: &str,
    job: &Job,
    items: &[Item],
) -> Result<ChunkResult, String> {
    if job.chunk_size == 0 {
        return Err("chunk_size must be positive".into());
    }
    let start = job
        .chunk
        .checked_mul(job.chunk_size)
        .ok_or("chunk out of range")?;
    if start >= items.len() {
        return Err("chunk out of range".into());
    }
    let chunk = &items[start..items.len().min(start + job.chunk_size)];

    let (signer, report_hash) = model_signer(http, key, job)?;
    let mut confusion = Confusion::default();
    let mut answers = Vec::with_capacity(chunk.len());
    let mut digest = [0u8; 32];
    for item in chunk {
        let (label, answer, record) = grade_item(http, key, job, &signer, item)?;
        confusion.record(item.label, label);
        answers.push(answer);
        let mut h = Sha256::new();
        h.update(digest);
        h.update(record);
        digest = h.finalize().into();
    }
    Ok(ChunkResult {
        set_id: job.set_id.clone(),
        model: job.model.clone(),
        chunk: job.chunk,
        nonce: job.nonce.clone(),
        set_commitment: set_commitment(items),
        n: chunk.len() as u32,
        confusion,
        signer,
        attestation_report_sha256: report_hash,
        answers,
        records_digest: hex::encode(digest),
    })
}

#[cfg(test)]
mod tests;
