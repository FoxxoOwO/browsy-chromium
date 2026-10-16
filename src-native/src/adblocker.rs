#![deny(clippy::all)]

use napi_derive::napi;
use std::sync::atomic::{AtomicU32, Ordering};
use std::sync::{Arc, RwLock};
use adblock::engine::Engine;
use adblock::request::Request;

#[napi]
pub struct NativeAdBlocker {
    engine: Arc<RwLock<Engine>>,
    total_blocked: AtomicU32,
}

#[napi]
impl NativeAdBlocker {
    #[napi(constructor)]
    pub fn new(rules: Option<Vec<String>>) -> Self {
        let rule_text = match rules {
            Some(r) => r.join("\n"),
            None => include_str!("default_filters.txt").to_string(),
        };

        let engine = Engine::new_with_list_text(&rule_text);

        Self {
            engine: Arc::new(RwLock::new(engine)),
            total_blocked: AtomicU32::new(0),
        }
    }

    #[napi]
    pub fn should_block(&self, url: String, source_url: String, request_type: String) -> bool {
        let engine = match self.engine.read() {
            Ok(e) => e,
            Err(_) => return false,
        };

        let req = match Request::new(&url, &source_url, &request_type, "GET") {
            Ok(r) => r,
            Err(_) => return false,
        };

        let blocker_result = engine.check_network_request(&req);
        // In adblock-rust, a request is blocked if a filter is matched and no exception applies
        let is_blocked = blocker_result.filter.is_some() && blocker_result.exception.is_none();

        if is_blocked {
            self.total_blocked.fetch_add(1, Ordering::Relaxed);
            true
        } else {
            false
        }
    }

    #[napi]
    pub fn get_total_blocked(&self) -> u32 {
        self.total_blocked.load(Ordering::Relaxed)
    }
}
