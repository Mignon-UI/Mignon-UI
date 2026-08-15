// src-tauri/src/llm_stream.rs
// Native LLM Streaming and Abort handling in Rust.

use std::collections::HashSet;
use std::sync::Mutex;

static ACTIVE_STREAMS: Mutex<Option<HashSet<String>>> = Mutex::new(None);

fn add_active_stream(task_id: String) {
    if let Ok(mut guard) = ACTIVE_STREAMS.lock() {
        if guard.is_none() {
            *guard = Some(HashSet::new());
        }
        if let Some(ref mut set) = *guard {
            set.insert(task_id);
        }
    }
}

fn remove_active_stream(task_id: &str) {
    if let Ok(mut guard) = ACTIVE_STREAMS.lock() {
        if let Some(ref mut set) = *guard {
            set.remove(task_id);
        }
    }
}

fn is_stream_active(task_id: &str) -> bool {
    if let Ok(guard) = ACTIVE_STREAMS.lock() {
        if let Some(ref set) = *guard {
            return set.contains(task_id);
        }
    }
    false
}

fn run_stream_thread(
    app: &tauri::AppHandle,
    url: &str,
    headers_map: std::collections::HashMap<String, String>,
    payload: serde_json::Value,
    task_id: &str,
) -> Result<(), String> {
    use std::io::BufRead;
    use tauri::Emitter;

    let client_builder = reqwest::blocking::Client::builder();
    let mut headers = reqwest::header::HeaderMap::new();
    for (k, v) in headers_map {
        if let Ok(name) = reqwest::header::HeaderName::from_bytes(k.as_bytes()) {
            if let Ok(val) = reqwest::header::HeaderValue::from_str(&v) {
                headers.insert(name, val);
            }
        }
    }

    let client = client_builder.default_headers(headers).build().map_err(|e| e.to_string())?;
    let payload_str = serde_json::to_string(&payload).map_err(|e| e.to_string())?;
    let response = client.post(url)
        .header(reqwest::header::CONTENT_TYPE, "application/json")
        .body(payload_str)
        .send()
        .map_err(|e| e.to_string())?;

    if !response.status().is_success() {
        let status = response.status();
        let err_body = response.text().unwrap_or_default();
        return Err(format!("LLM API returned status {}: {}", status, err_body));
    }

    let is_anthropic = url.contains("api.anthropic.com");
    let reader = std::io::BufReader::new(response);

    for line_res in reader.lines() {
        if !is_stream_active(task_id) {
            break;
        }

        let line = line_res.map_err(|e| e.to_string())?;
        let clean_line = line.trim();
        if clean_line.is_empty() || !clean_line.starts_with("data:") {
            continue;
        }

        let data_content = clean_line.trim_start_matches("data:").trim();
        if data_content == "[DONE]" {
            break;
        }

        if let Ok(parsed) = serde_json::from_str::<serde_json::Value>(data_content) {
            let mut token = None;

            if is_anthropic {
                if parsed.get("type").and_then(|v| v.as_str()) == Some("content_block_delta") {
                    token = parsed.get("delta").and_then(|d| d.get("text")).and_then(|t| t.as_str()).map(|s| s.to_string());
                }
            } else {
                if let Some(choices) = parsed.get("choices").and_then(|c| c.as_array()) {
                    if !choices.is_empty() {
                        token = choices[0].get("delta").and_then(|d| d.get("content")).and_then(|c| c.as_str()).map(|s| s.to_string());
                    }
                } else {
                    token = parsed.get("message").and_then(|m| m.get("content")).and_then(|c| c.as_str()).map(|s| s.to_string());
                }
            }

            if let Some(tok) = token {
                let _ = app.emit(&format!("llm-token-{}", task_id), tok);
            }
        }
    }

    Ok(())
}

#[tauri::command]
pub fn stream_llm_response_rust(
    app: tauri::AppHandle,
    url: String,
    headers: std::collections::HashMap<String, String>,
    payload: serde_json::Value,
    task_id: String,
) -> Result<(), String> {
    add_active_stream(task_id.clone());
    let app_clone = app.clone();
    let task_id_clone = task_id.clone();
    
    std::thread::spawn(move || {
        use tauri::Emitter;
        if let Err(e) = run_stream_thread(&app_clone, &url, headers, payload, &task_id_clone) {
            let _ = app_clone.emit(&format!("llm-error-{}", task_id_clone), e);
        } else {
            let _ = app_clone.emit(&format!("llm-done-{}", task_id_clone), ());
        }
        remove_active_stream(&task_id_clone);
    });
    
    Ok(())
}

#[tauri::command]
pub fn abort_llm_stream_rust(task_id: String) {
    remove_active_stream(&task_id);
}
