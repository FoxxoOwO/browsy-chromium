#![deny(clippy::all)]

use napi_derive::napi;

#[napi]
pub fn native_expand_text(
    template: String,
    date_val: String,
    time_val: String,
    year_val: String,
    clipboard_val: String,
) -> String {
    template
        .replace("{date}", &date_val)
        .replace("{time}", &time_val)
        .replace("{year}", &year_val)
        .replace("{clipboard}", &clipboard_val)
}
