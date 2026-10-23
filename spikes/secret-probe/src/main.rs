//! Spike probe run inside an OutLayer TDX worker.
//!
//! Reports whether the `TEST_SET` secret was injected (only its length and
//! SHA-256, never the contents) and whether the enclave can reach NEAR AI
//! Cloud's free endpoints: the model catalog and a fresh, nonce-bound
//! attestation for a TEE model.
//!
//! `VARIANT` changes the binary's bytes, and so its SHA-256, without changing
//! behaviour. That gives a second build to show that a secret locked to one
//! build is refused to another.
use serde_json::{json, Value};
use sha2::{Digest, Sha256};
use std::io::{self, Read};
use std::time::Duration;
use wasi_http_client::Client;

const VARIANT: &str = "a";
const NEARAI: &str = "https://cloud-api.near.ai";
const TEE_MODEL: &str = "Qwen/Qwen3.8-27B";

fn get(url: &str) -> Result<(u16, Vec<u8>), String> {
    let resp = Client::new()
        .get(url)
        .header("x-no-aliasing", "true")
        .connect_timeout(Duration::from_secs(20))
        .send()
        .map_err(|e| format!("{e:?}"))?;
    let status = resp.status();
    let body = resp.body().map_err(|e| format!("{e:?}"))?;
    Ok((status, body))
}

fn main() {
    let mut raw = String::new();
    let _ = io::stdin().read_to_string(&mut raw);
    let input: Value = serde_json::from_str(&raw).unwrap_or(Value::Null);
    let nonce = input["nonce"].as_str().unwrap_or("").to_string();

    let secret = match std::env::var("TEST_SET") {
        Ok(s) => json!({"present": true, "len": s.len(), "sha256": hex::encode(Sha256::digest(s.as_bytes()))}),
        Err(_) => json!({"present": false}),
    };

    let catalog = match get(&format!("{NEARAI}/v1/model/list")) {
        Ok((status, body)) => {
            let verifiable = serde_json::from_slice::<Value>(&body)
                .ok()
                .and_then(|v| v["models"].as_array().cloned())
                .map(|ms| {
                    ms.iter()
                        .filter(|m| m["metadata"]["verifiable"] == true)
                        .count()
                })
                .unwrap_or(0);
            json!({"status": status, "verifiable_models": verifiable})
        }
        Err(e) => json!({"error": e}),
    };

    let attestation = match get(&format!(
        "{NEARAI}/v1/attestation/ita-token?model={}&nonce={nonce}",
        TEE_MODEL.replace('/', "%2F")
    )) {
        Ok((status, body)) => {
            let v: Value = serde_json::from_slice(&body).unwrap_or(Value::Null);
            json!({
                "status": status,
                "nonce_echoed": v["nonce"].as_str() == Some(nonce.as_str()),
                "model_tokens": v["models"].as_array().map(|a| a.len()).unwrap_or(0),
            })
        }
        Err(e) => json!({"error": e}),
    };

    println!(
        "{}",
        json!({"variant": VARIANT, "secret": secret, "nearai_catalog": catalog, "nearai_attestation": attestation})
    );
}
