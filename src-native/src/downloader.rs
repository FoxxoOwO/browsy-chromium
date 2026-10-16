#![deny(clippy::all)]

use napi_derive::napi;

#[napi(object)]
pub struct DownloadResult {
    pub success: bool,
    pub bytes_written: i64,
    pub filename: String,
    pub error: Option<String>,
}

#[napi]
pub struct NativeVideoDownloader {}

#[napi]
impl NativeVideoDownloader {
    #[napi(constructor)]
    pub fn new() -> Self {
        Self {}
    }

    #[napi]
    pub async fn download_stream(&self, url: String, dest_path: String) -> napi::Result<DownloadResult> {
        let client = reqwest::Client::builder()
            .danger_accept_invalid_certs(false)
            .build()
            .map_err(|e| napi::Error::from_reason(e.to_string()))?;

        let resp = match client.get(&url).send().await {
            Ok(r) => r,
            Err(e) => {
                return Ok(DownloadResult {
                    success: false,
                    bytes_written: 0,
                    filename: dest_path,
                    error: Some(e.to_string()),
                });
            }
        };

        let bytes = match resp.bytes().await {
            Ok(b) => b,
            Err(e) => {
                return Ok(DownloadResult {
                    success: false,
                    bytes_written: 0,
                    filename: dest_path,
                    error: Some(e.to_string()),
                });
            }
        };

        let size = bytes.len() as i64;
        match std::fs::write(&dest_path, bytes) {
            Ok(_) => Ok(DownloadResult {
                success: true,
                bytes_written: size,
                filename: dest_path,
                error: None,
            }),
            Err(e) => Ok(DownloadResult {
                success: false,
                bytes_written: 0,
                filename: dest_path,
                error: Some(e.to_string()),
            }),
        }
    }
}
