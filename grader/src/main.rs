//! WASI entry point. Reads a [`Job`] from stdin and the test set and NEAR AI
//! key from the secrets OutLayer injects, grades the chunk, and prints one
//! JSON envelope.

use proctor_grader::{grade_chunk, Envelope, Item, Job};
use std::io::{self, Read, Write};

fn run() -> Result<proctor_grader::ChunkResult, String> {
    let mut raw = String::new();
    io::stdin()
        .read_to_string(&mut raw)
        .map_err(|e| e.to_string())?;
    let job: Job = serde_json::from_str(&raw).map_err(|e| format!("bad job: {e}"))?;
    let set = std::env::var("TEST_SET").map_err(|_| "TEST_SET secret is not available")?;
    let items: Vec<Item> = serde_json::from_str(&set).map_err(|e| format!("bad test set: {e}"))?;
    let key =
        std::env::var("NEARAI_API_KEY").map_err(|_| "NEARAI_API_KEY secret is not available")?;
    grade_chunk(&http::WasiHttp, &key, &job, &items)
}

fn main() {
    let envelope = match run() {
        Ok(r) => Envelope {
            success: true,
            output: Some(r),
            error: None,
        },
        Err(e) => Envelope {
            success: false,
            output: None,
            error: Some(e),
        },
    };
    print!(
        "{}",
        serde_json::to_string(&envelope).expect("envelope serialises")
    );
    io::stdout().flush().expect("stdout");
}

#[cfg(target_os = "wasi")]
mod http {
    use proctor_grader::{Http, Response};
    use std::time::Duration;
    use wasi_http_client::Client;

    pub struct WasiHttp;

    impl Http for WasiHttp {
        fn get(&self, url: &str, headers: &[(&str, &str)]) -> Result<Response, String> {
            let mut req = Client::new()
                .get(url)
                .connect_timeout(Duration::from_secs(30));
            for (k, v) in headers {
                req = req.header(*k, *v);
            }
            let resp = req.send().map_err(|e| format!("{e:?}"))?;
            let status = resp.status();
            Ok(Response {
                status,
                body: resp.body().map_err(|e| format!("{e:?}"))?,
            })
        }

        fn post(
            &self,
            url: &str,
            headers: &[(&str, &str)],
            body: &[u8],
        ) -> Result<Response, String> {
            let mut req = Client::new()
                .post(url)
                .connect_timeout(Duration::from_secs(30));
            for (k, v) in headers {
                req = req.header(*k, *v);
            }
            let resp = req.body(body).send().map_err(|e| format!("{e:?}"))?;
            let status = resp.status();
            Ok(Response {
                status,
                body: resp.body().map_err(|e| format!("{e:?}"))?,
            })
        }

        fn pause(&self, attempt: usize) {
            std::thread::sleep(Duration::from_secs(2 << attempt.min(3)));
        }
    }
}

/// Native builds (tests, local runs) have no WASI HTTP; they use the library
/// with their own [`proctor_grader::Http`].
#[cfg(not(target_os = "wasi"))]
mod http {
    use proctor_grader::{Http, Response};

    pub struct WasiHttp;

    impl Http for WasiHttp {
        fn get(&self, _: &str, _: &[(&str, &str)]) -> Result<Response, String> {
            Err("HTTP is only available in the WASI build".into())
        }
        fn post(&self, _: &str, _: &[(&str, &str)], _: &[u8]) -> Result<Response, String> {
            Err("HTTP is only available in the WASI build".into())
        }
    }
}
