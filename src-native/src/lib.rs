#![deny(clippy::all)]

use napi_derive::napi;

pub mod adblocker;
pub mod downloader;
pub mod expander;

#[napi]
pub fn get_rust_core_version() -> String {
    format!("Browsy Native Core v0.1.0 (Rust Engine with Brave adblock-rust)")
}
