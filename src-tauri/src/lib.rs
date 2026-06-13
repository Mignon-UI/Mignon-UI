// src-tauri/src/lib.rs
// Rust entrypoint for Tauri v2. Configures plugins and exposes cryptographic commands for secure key storage.

use std::fs;
use std::fs::File;
use std::io::{Read, Write};
use tauri::{AppHandle, Manager};
use aes_gcm::{
  aead::{Aead, KeyInit},
  Aes256Gcm, Nonce,
};

// Helper to decode a hex string to bytes
fn hex_decode(hex_str: &str) -> Result<Vec<u8>, String> {
  let mut bytes = Vec::new();
  for i in (0..hex_str.len()).step_by(2) {
    if i + 2 <= hex_str.len() {
      let byte = u8::from_str_radix(&hex_str[i..i+2], 16)
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
  let ciphertext = cipher.encrypt(nonce, plaintext).map_err(|e| e.to_string())?;
  Ok((nonce_bytes.to_vec(), ciphertext))
}

// AES-256-GCM decryption helper
fn aes_gcm_decrypt(nonce_bytes: &[u8], ciphertext: &[u8], key: &[u8]) -> Result<Vec<u8>, String> {
  let cipher = Aes256Gcm::new_from_slice(key).map_err(|e| e.to_string())?;
  let nonce = Nonce::from_slice(nonce_bytes);
  let decrypted = cipher.decrypt(nonce, ciphertext).map_err(|e| e.to_string())?;
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
  
  if encrypted_str.starts_with("enc::aes256gcm::") {
    let key = get_secret_key(&app)?;
    let parts_str = &encrypted_str[16..];
    let parts: Vec<&str> = parts_str.split(':').collect();
    if parts.len() != 2 {
      return Err("Invalid encrypted key format".to_string());
    }
    
    let nonce_bytes = hex_decode(parts[0])?;
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
  open_file_natively(&url)
}

#[tauri::command]
fn start_update_download(app: tauri::AppHandle, url: String, filename: String) -> Result<(), String> {
  std::thread::spawn(move || {
    if let Err(e) = download_and_open(&app, &url, &filename) {
      use tauri::Emitter;
      let _ = app.emit("download-error", e);
    }
  });
  Ok(())
}

fn download_and_open(app: &tauri::AppHandle, url: &str, filename: &str) -> Result<(), String> {
  use tauri::Emitter;

  let temp_dir = std::env::temp_dir();
  let target_path = temp_dir.join(filename);

  let client = reqwest::blocking::Client::builder()
    .user_agent("Mignon-UI-Updater")
    .build()
    .map_err(|e| e.to_string())?;

  let mut response = client.get(url)
    .send()
    .map_err(|e| e.to_string())?;

  if !response.status().is_success() {
    return Err(format!("Server returned status {}", response.status()));
  }

  let total_size = response.content_length().unwrap_or(0);
  let mut file = File::create(&target_path).map_err(|e| e.to_string())?;
  let mut buffer = [0; 8192];
  let mut downloaded = 0;

  loop {
    let size = response.read(&mut buffer).map_err(|e| e.to_string())?;
    if size == 0 {
      break;
    }
    file.write_all(&buffer[..size]).map_err(|e| e.to_string())?;
    downloaded += size as u64;

    if total_size > 0 {
      let progress = (downloaded as f64 / total_size as f64 * 100.0) as u32;
      let _ = app.emit("download-progress", progress);
    }
  }

  file.sync_all().map_err(|e| e.to_string())?;

  let target_path_str = target_path.to_string_lossy().to_string();
  let _ = app.emit("download-complete", target_path_str.clone());

  open_file_natively(&target_path_str)?;

  Ok(())
}

fn open_file_natively(path: &str) -> Result<(), String> {
  #[cfg(target_os = "windows")]
  {
    std::process::Command::new("cmd")
      .args(["/C", "start", "", path])
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

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  tauri::Builder::default()
    .plugin(tauri_plugin_sql::Builder::default().build())
    .plugin(tauri_plugin_http::init())
    .invoke_handler(tauri::generate_handler![
      encrypt_key, 
      decrypt_key, 
      set_system_bars_color,
      start_update_download,
      open_url
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
