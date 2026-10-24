//! Checks a grader result before the contract accepts it. The result arrives
//! through OutLayer's callback, so it was produced by the attested grader; the
//! checks here make sure it is the result for *this* chunk of *this* run and
//! that every answer really came from the registered model's TEE key.

use crate::{is_hex, Model, TestSet};
use near_sdk::env;
use near_sdk::near;
use near_sdk::serde::Deserialize;
use near_sdk::serde_json;

#[near(serializers = [borsh, json])]
#[derive(Clone, Copy, Debug, Default, PartialEq, Eq)]
pub struct Confusion {
    pub tp: u32,
    pub fp: u32,
    pub tn: u32,
    pub fn_: u32,
    pub unparsed: u32,
}

impl Confusion {
    pub fn total(&self) -> u32 {
        self.tp + self.fp + self.tn + self.fn_
    }

    pub fn add(&mut self, other: &Confusion) {
        self.tp += other.tp;
        self.fp += other.fp;
        self.tn += other.tn;
        self.fn_ += other.fn_;
        self.unparsed += other.unparsed;
    }
}

#[derive(Deserialize)]
#[serde(crate = "near_sdk::serde")]
struct Envelope {
    success: bool,
    output: Option<Output>,
    error: Option<String>,
}

#[derive(Deserialize)]
#[serde(crate = "near_sdk::serde")]
struct Output {
    set_id: String,
    model: String,
    chunk: u32,
    nonce: String,
    n: u32,
    confusion: Confusion,
    signer: String,
    answers: Vec<Answer>,
    records_digest: String,
}

#[derive(Deserialize)]
#[serde(crate = "near_sdk::serde")]
struct Answer {
    text: String,
    signature: String,
}

/// What the contract keeps from an accepted chunk.
#[derive(Debug, PartialEq)]
pub struct ChunkReport {
    pub confusion: Confusion,
    pub records_digest: String,
    pub signer: String,
}

fn decode_hex<const N: usize>(s: &str) -> Option<[u8; N]> {
    if s.len() != 2 * N {
        return None;
    }
    let mut out = [0u8; N];
    for (i, byte) in out.iter_mut().enumerate() {
        *byte = u8::from_str_radix(s.get(2 * i..2 * i + 2)?, 16).ok()?;
    }
    Some(out)
}

/// Validate the grader's stdout for `chunk` of the run with `nonce`.
pub fn check_chunk(
    out: &str,
    set: &TestSet,
    model: &Model,
    nonce: &str,
    chunk: u32,
) -> Result<ChunkReport, String> {
    let env_: Envelope =
        serde_json::from_str(out).map_err(|e| format!("unreadable grader output: {e}"))?;
    if !env_.success {
        return Err(format!("grader error: {}", env_.error.unwrap_or_default()));
    }
    let o = env_
        .output
        .ok_or("grader reported success without output")?;

    if o.set_id != set.set_id || o.model != model.model_id || o.chunk != chunk || o.nonce != nonce {
        return Err("result is for a different set, model, chunk or run".into());
    }
    let start = chunk
        .checked_mul(set.chunk_size)
        .ok_or("chunk out of range")?;
    let expected = set
        .item_count
        .checked_sub(start)
        .ok_or("chunk out of range")?
        .min(set.chunk_size);
    if expected == 0
        || o.n != expected
        || o.answers.len() != expected as usize
        || o.confusion.total() != expected
    {
        return Err(format!("expected {expected} graded items"));
    }
    if o.confusion.unparsed > o.confusion.fp + o.confusion.fn_ {
        return Err("unparsed answers must be counted as wrong".into());
    }
    if !model.signers.contains(&o.signer) {
        return Err("answers signed by a key not registered for this model".into());
    }
    if !is_hex(&o.records_digest, 64) {
        return Err("bad records digest".into());
    }

    let key: [u8; 32] = decode_hex(&o.signer).ok_or("bad signer key")?;
    let prefix = format!("{}:", model.model_id);
    let mut requests: Vec<&str> = Vec::with_capacity(o.answers.len());
    for (i, a) in o.answers.iter().enumerate() {
        let rest = a
            .text
            .strip_prefix(&prefix)
            .ok_or_else(|| format!("answer {i} is for another model"))?;
        let (req, resp) = rest
            .split_once(':')
            .ok_or_else(|| format!("answer {i} malformed"))?;
        if !is_hex(req, 64) || !is_hex(resp, 64) {
            return Err(format!("answer {i} malformed"));
        }
        if requests.contains(&req) {
            return Err(format!("answer {i} repeats an earlier request"));
        }
        requests.push(req);
        let sig: [u8; 64] =
            decode_hex(&a.signature).ok_or_else(|| format!("answer {i} has a bad signature"))?;
        if !env::ed25519_verify(&sig, a.text.as_bytes(), &key) {
            return Err(format!("answer {i} signature does not verify"));
        }
    }
    Ok(ChunkReport {
        confusion: o.confusion,
        records_digest: o.records_digest,
        signer: o.signer,
    })
}
