// src-tauri/src/lib.rs
// Rust entrypoint for Tauri v2. Configures plugins and exposes cryptographic commands for secure key storage.
mod embeddings;
mod llm_stream;
mod turn_taking;

use aes_gcm::{
    aead::{Aead, KeyInit},
    Aes256Gcm, Nonce,
};
use std::fs;
use tauri::{AppHandle, Manager};
use url::Url;

// Helper to validate url scheme is http or https
fn is_safe_url(url_str: &str) -> bool {
    if let Ok(parsed) = Url::parse(url_str) {
        parsed.scheme() == "http" || parsed.scheme() == "https"
    } else {
        false
    }
}

// Helper to decode a hex string to bytes
fn hex_decode(hex_str: &str) -> Result<Vec<u8>, String> {
    let mut bytes = Vec::new();
    for i in (0..hex_str.len()).step_by(2) {
        if i + 2 <= hex_str.len() {
            let byte = u8::from_str_radix(&hex_str[i..i + 2], 16)
                .map_err(|e| format!("Invalid hex byte: {}", e))?;
            bytes.push(byte);
        }
    }
    Ok(bytes)
}

// Helper to get or create a persistent 32-byte symmetric encryption key in the secure app data directory
fn get_secret_key(app: &AppHandle) -> Result<Vec<u8>, String> {
    let app_dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    fs::create_dir_all(&app_dir).map_err(|e| e.to_string())?;
    let key_path = app_dir.join("secret.key");

    if key_path.exists() {
        fs::read(&key_path).map_err(|e| e.to_string())
    } else {
        // Generate secure 32 random bytes using getrandom CSPRNG
        let mut key = vec![0u8; 32];
        getrandom::getrandom(&mut key).map_err(|e| e.to_string())?;

        fs::write(&key_path, &key).map_err(|e| e.to_string())?;

        // Restrict file permissions to owner-only (0600) on Unix-like platforms
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            let metadata = fs::metadata(&key_path).map_err(|e| e.to_string())?;
            let mut permissions = metadata.permissions();
            permissions.set_mode(0o600);
            fs::set_permissions(&key_path, permissions).map_err(|e| e.to_string())?;
        }

        Ok(key)
    }
}

// AES-256-GCM encryption helper
fn aes_gcm_encrypt(plaintext: &[u8], key: &[u8]) -> Result<(Vec<u8>, Vec<u8>), String> {
    let cipher = Aes256Gcm::new_from_slice(key).map_err(|e| e.to_string())?;
    let mut nonce_bytes = [0u8; 12];
    getrandom::getrandom(&mut nonce_bytes).map_err(|e| e.to_string())?;
    let nonce = Nonce::from_slice(&nonce_bytes);
    let ciphertext = cipher
        .encrypt(nonce, plaintext)
        .map_err(|e| e.to_string())?;
    Ok((nonce_bytes.to_vec(), ciphertext))
}

// AES-256-GCM decryption helper
fn aes_gcm_decrypt(nonce_bytes: &[u8], ciphertext: &[u8], key: &[u8]) -> Result<Vec<u8>, String> {
    let cipher = Aes256Gcm::new_from_slice(key).map_err(|e| e.to_string())?;
    let nonce = Nonce::from_slice(nonce_bytes);
    let decrypted = cipher
        .decrypt(nonce, ciphertext)
        .map_err(|e| e.to_string())?;
    Ok(decrypted)
}

// Deprecated rc4_crypt implementation removed for security compliance.

#[tauri::command]
fn encrypt_key(app: AppHandle, plaintext: String) -> Result<String, String> {
    if plaintext.is_empty() {
        return Ok(String::new());
    }
    let key = get_secret_key(&app)?;
    let (nonce, ciphertext) = aes_gcm_encrypt(plaintext.as_bytes(), &key)?;
    let nonce_hex: String = nonce.iter().map(|b| format!("{:02x}", b)).collect();
    let cipher_hex: String = ciphertext.iter().map(|b| format!("{:02x}", b)).collect();
    Ok(format!("enc::aes256gcm::{}:{}", nonce_hex, cipher_hex))
}

#[tauri::command]
fn decrypt_key(app: AppHandle, encrypted_str: String) -> Result<String, String> {
    if encrypted_str.is_empty() {
        return Ok(String::new());
    }
    if !encrypted_str.starts_with("enc::") {
        return Ok(encrypted_str);
    }

    if let Some(parts_str) = encrypted_str.strip_prefix("enc::aes256gcm::") {
        let key = get_secret_key(&app)?;
        let parts: Vec<&str> = parts_str.split(':').collect();
        if parts.len() != 2 {
            return Err("Invalid encrypted key format".to_string());
        }

        let nonce_bytes = hex_decode(parts[0])?;
        if nonce_bytes.len() != 12 {
            return Err("Invalid nonce length: must be 12 bytes".to_string());
        }
        let cipher_bytes = hex_decode(parts[1])?;

        let decrypted = aes_gcm_decrypt(&nonce_bytes, &cipher_bytes, &key)?;
        String::from_utf8(decrypted).map_err(|e| e.to_string())
    } else if encrypted_str.starts_with("enc::rc4hex::") {
        // Deprecated RC4 fallback: return empty to force settings re-entry
        Ok(String::new())
    } else {
        // Return empty for legacy python encryptions to force a clean settings re-entry
        Ok(String::new())
    }
}

#[derive(serde::Deserialize)]
struct Candidate {
    id: String,
    r#type: String,
    source_id: String,
    title: String,
    text: String,
    vector: Vec<u8>,
}

#[derive(serde::Serialize)]
struct ScoredResult {
    id: String,
    r#type: String,
    source_id: String,
    title: String,
    text: String,
    _distance: f32,
    _similarity: f32,
}

fn calculate_cosine_similarity(
    query_vector: &[f32],
    query_norm: f32,
    candidate_bytes: &[u8],
) -> Option<(f32, f32)> {
    if !candidate_bytes.len().is_multiple_of(4) {
        return None;
    }
    let num_floats = candidate_bytes.len() / 4;
    if num_floats == 0 {
        return None;
    }

    let mut dot = 0.0f32;
    let mut cand_norm_sq = 0.0f32;
    let min_len = query_vector.len().min(num_floats);

    let (chunks, _) = candidate_bytes.as_chunks::<4>();
    for (i, chunk) in chunks.iter().enumerate().take(min_len) {
        let val = f32::from_ne_bytes(*chunk);
        let q = query_vector[i];
        dot += q * val;
        cand_norm_sq += val * val;
    }

    if query_norm <= 0.0 || cand_norm_sq <= 0.0 {
        return None;
    }

    let sim = dot / (query_norm * cand_norm_sq.sqrt());
    let dist = 1.0 - sim;
    Some((sim, dist))
}

#[tauri::command]
fn compute_similarities_rust(
    query_vector: Vec<f32>,
    candidates: Vec<Candidate>,
    top_k: usize,
) -> Result<Vec<ScoredResult>, String> {
    let mut query_norm_sq = 0.0f32;
    for &q in &query_vector {
        query_norm_sq += q * q;
    }
    let query_norm = query_norm_sq.sqrt();
    if query_norm <= 0.0 {
        return Ok(Vec::new());
    }

    let mut scored_results = Vec::new();

    for candidate in candidates {
        if let Some((sim, dist)) =
            calculate_cosine_similarity(&query_vector, query_norm, &candidate.vector)
        {
            if dist <= 0.70 {
                scored_results.push(ScoredResult {
                    id: candidate.id,
                    r#type: candidate.r#type,
                    source_id: candidate.source_id,
                    title: candidate.title,
                    text: candidate.text,
                    _distance: dist,
                    _similarity: sim,
                });
            }
        }
    }

    scored_results.sort_by(|a, b| {
        a._distance
            .partial_cmp(&b._distance)
            .unwrap_or(std::cmp::Ordering::Equal)
    });
    scored_results.truncate(top_k);

    Ok(scored_results)
}

#[tauri::command]
#[allow(unused_variables)]
fn set_system_bars_color(window: tauri::Window, color_hex: String, dark_icons: bool) {
    #[cfg(target_os = "android")]
    {
        if let Some(webview) = window.get_webview_window("main") {
            let _ = webview.with_webview(move |webview| {
                let handle = webview.jni_handle();
                let _ = handle.exec(move |env, activity, _webview| {
                    if let Ok(class) = env.get_object_class(activity) {
                        if let Ok(j_color) = env.new_string(&color_hex) {
                            let _ = env.call_method(
                                activity,
                                "setSystemBarsColor",
                                "(Ljava/lang/String;Z)V",
                                &[
                                    jni::objects::JValue::Object(&j_color),
                                    jni::objects::JValue::Bool(if dark_icons { 1 } else { 0 }),
                                ],
                            );
                        }
                    }
                });
            });
        }
    }
}

#[tauri::command]
fn open_url(url: String) -> Result<(), String> {
    if !is_safe_url(&url) {
        return Err(
            "Blocked opening unsafe URL: Only http and https schemes are allowed".to_string(),
        );
    }
    open_file_natively(&url)
}

fn open_file_natively(path: &str) -> Result<(), String> {
    #[cfg(target_os = "windows")]
    {
        std::process::Command::new("explorer")
            .arg(path)
            .spawn()
            .map_err(|e| e.to_string())?;
    }
    #[cfg(target_os = "macos")]
    {
        std::process::Command::new("open")
            .arg(path)
            .spawn()
            .map_err(|e| e.to_string())?;
    }
    #[cfg(not(any(target_os = "windows", target_os = "macos")))]
    {
        std::process::Command::new("xdg-open")
            .arg(path)
            .spawn()
            .map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[tauri::command]
fn get_system_gpu_info() -> Result<String, String> {
    #[cfg(target_os = "windows")]
    {
        let output = std::process::Command::new("powershell")
            .args([
                "-NoProfile",
                "-Command",
                "Get-CimInstance Win32_VideoController | Select-Object -ExpandProperty Name",
            ])
            .output();

        if let Ok(out) = output {
            let names = String::from_utf8_lossy(&out.stdout).to_string();
            let trimmed = names.trim();
            if !trimmed.is_empty() {
                // If there's an NVIDIA or AMD dedicated GPU in the list, prioritize returning that
                for line in trimmed.lines() {
                    let l = line.trim();
                    let lower = l.to_lowercase();
                    if lower.contains("nvidia")
                        || lower.contains("geforce")
                        || lower.contains("rtx")
                        || lower.contains("gtx")
                        || lower.contains("radeon")
                    {
                        return Ok(l.to_string());
                    }
                }
                if let Some(first) = trimmed.lines().next() {
                    return Ok(first.trim().to_string());
                }
            }
        }
    }
    #[cfg(target_os = "macos")]
    {
        let output = std::process::Command::new("system_profiler")
            .args(["SPDisplaysDataType"])
            .output();
        if let Ok(out) = output {
            let text = String::from_utf8_lossy(&out.stdout);
            for line in text.lines() {
                if line.contains("Chipset Model:") {
                    return Ok(line.replace("Chipset Model:", "").trim().to_string());
                }
            }
        }
    }
    #[cfg(not(any(target_os = "windows", target_os = "macos")))]
    {
        let output = std::process::Command::new("lspci").output();
        if let Ok(out) = output {
            let text = String::from_utf8_lossy(&out.stdout);
            for line in text.lines() {
                if line.contains("VGA") || line.contains("3D") {
                    return Ok(line.trim().to_string());
                }
            }
        }
    }
    Ok("".to_string())
}

#[tauri::command]
fn export_database_backup(app: AppHandle, target_path: String) -> Result<(), String> {
    let app_dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    let db_path = app_dir.join("data.db");
    if !db_path.exists() {
        return Err("Database file does not exist yet".to_string());
    }
    fs::copy(&db_path, &target_path).map_err(|e| format!("Failed to export backup: {}", e))?;
    Ok(())
}

#[tauri::command]
fn restore_database_backup(app: AppHandle, source_path: String) -> Result<(), String> {
    let src = std::path::Path::new(&source_path);
    if !src.exists() {
        return Err("Selected backup file does not exist".to_string());
    }

    // Validate SQLite magic header bytes: "SQLite format 3\0"
    let file_bytes = fs::read(src).map_err(|e| format!("Failed to read backup file: {}", e))?;
    if file_bytes.len() < 16 || &file_bytes[0..16] != b"SQLite format 3\0" {
        return Err(
            "Invalid backup file: Not a valid Mignon database (.mignon / .sqlite)".to_string(),
        );
    }

    let app_dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    fs::create_dir_all(&app_dir).map_err(|e| e.to_string())?;
    let db_path = app_dir.join("data.db");

    fs::write(&db_path, file_bytes).map_err(|e| format!("Failed to restore database: {}", e))?;
    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let mut builder = tauri::Builder::default()
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_sql::Builder::default().build())
        .plugin(tauri_plugin_http::init())
        .plugin(tauri_plugin_process::init());

    #[cfg(desktop)]
    {
        builder = builder
            .plugin(tauri_plugin_updater::Builder::new().build())
            .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
                let _ = app.get_webview_window("main").map(|w| {
                    let _ = w.show();
                    let _ = w.unminimize();
                    let _ = w.set_focus();
                });
            }));
    }

    builder
        .invoke_handler(tauri::generate_handler![
            encrypt_key,
            decrypt_key,
            set_system_bars_color,
            open_url,
            compute_similarities_rust,
            get_system_gpu_info,
            embeddings::embed_texts_rust,
            turn_taking::run_efficient_selector_rust,
            llm_stream::stream_llm_response_rust,
            llm_stream::abort_llm_stream_rust,
            export_database_backup,
            restore_database_backup
        ])
        .setup(|app| {
            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
            }
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
