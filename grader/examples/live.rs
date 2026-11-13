//! Run the grader's library against the real NEAR AI Cloud from a normal
//! machine, using `curl` for HTTP. For checking the signature path end to end
//! outside OutLayer; never point it at a private set on an untrusted machine.
//!
//! Usage: NEARAI_API_KEY=... cargo run --example live -- <set.json> <model> <chunk> <chunk_size>
//!
//! Or `--job`: behave exactly like the WASI grader does inside OutLayer (a Job
//! on stdin, the set in the TEST_SET variable, one JSON envelope on stdout),
//! so a keeper can run real grading where OutLayer can't run it yet.

use proctor_grader::{grade_chunk, Envelope, Http, Item, Job, Response};
use std::io::Write;
use std::process::{Command, Stdio};
use std::time::Duration;

struct Curl;

fn curl(
    method: &str,
    url: &str,
    headers: &[(&str, &str)],
    body: Option<&[u8]>,
) -> Result<Response, String> {
    let mut cmd = Command::new("curl");
    cmd.args(["-sS", "-X", method, url, "-o", "-", "-w", "\n%{http_code}"]);
    for (k, v) in headers {
        cmd.args(["-H", &format!("{k}: {v}")]);
    }
    if body.is_some() {
        cmd.args(["--data-binary", "@-"]);
    }
    let mut child = cmd
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .spawn()
        .map_err(|e| e.to_string())?;
    if let Some(b) = body {
        child
            .stdin
            .take()
            .unwrap()
            .write_all(b)
            .map_err(|e| e.to_string())?;
    } else {
        drop(child.stdin.take());
    }
    let out = child.wait_with_output().map_err(|e| e.to_string())?;
    let mut raw = out.stdout;
    let nl = raw
        .iter()
        .rposition(|&c| c == b'\n')
        .ok_or("no status from curl")?;
    let status = String::from_utf8_lossy(&raw[nl + 1..])
        .trim()
        .parse()
        .map_err(|_| "bad status")?;
    raw.truncate(nl);
    Ok(Response { status, body: raw })
}

impl Http for Curl {
    fn get(&self, url: &str, headers: &[(&str, &str)]) -> Result<Response, String> {
        curl("GET", url, headers, None)
    }
    fn post(&self, url: &str, headers: &[(&str, &str)], body: &[u8]) -> Result<Response, String> {
        curl("POST", url, headers, Some(body))
    }
    fn pause(&self, attempt: usize) {
        std::thread::sleep(Duration::from_secs(2 << attempt.min(3)));
    }
}

fn job_mode() {
    let run = || -> Result<proctor_grader::ChunkResult, String> {
        let mut raw = String::new();
        std::io::Read::read_to_string(&mut std::io::stdin(), &mut raw).map_err(|e| e.to_string())?;
        let job: Job = serde_json::from_str(&raw).map_err(|e| format!("bad job: {e}"))?;
        let set = std::env::var("TEST_SET").map_err(|_| "TEST_SET is not set")?;
        let items: Vec<Item> = serde_json::from_str(&set).map_err(|e| format!("bad test set: {e}"))?;
        let key = std::env::var("NEARAI_API_KEY").map_err(|_| "NEARAI_API_KEY is not set")?;
        grade_chunk(&Curl, &key, &job, &items)
    };
    let envelope = match run() {
        Ok(r) => Envelope { success: true, output: Some(r), error: None },
        Err(e) => Envelope { success: false, output: None, error: Some(e) },
    };
    print!("{}", serde_json::to_string(&envelope).expect("envelope serialises"));
}

fn main() {
    let args: Vec<String> = std::env::args().collect();
    if args.get(1).map(String::as_str) == Some("--job") {
        return job_mode();
    }
    let set: serde_json::Value =
        serde_json::from_str(&std::fs::read_to_string(&args[1]).unwrap()).unwrap();
    let items: Vec<Item> = serde_json::from_value(set["items"].clone()).unwrap();
    let job = Job {
        set_id: "live-check".into(),
        model: args[2].clone(),
        chunk: args[3].parse().unwrap(),
        chunk_size: args[4].parse().unwrap(),
        nonce: format!(
            "{:064x}",
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ),
        max_tokens: 4000,
    };
    let key = std::env::var("NEARAI_API_KEY").expect("NEARAI_API_KEY");
    let t0 = std::time::Instant::now();
    match grade_chunk(&Curl, &key, &job, &items) {
        Ok(r) => println!(
            "{}\nseconds: {:.1}",
            serde_json::to_string_pretty(&r).unwrap(),
            t0.elapsed().as_secs_f32()
        ),
        Err(e) => println!("ERROR: {e}"),
    }
}
