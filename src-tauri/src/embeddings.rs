// src-tauri/src/embeddings.rs
// Hardware-accelerated local text embeddings using native ONNX and multi-threading.

use fastembed::{EmbeddingModel, InitOptions, TextEmbedding};
use std::sync::{Mutex, OnceLock};

static EMBEDDING_MODEL: OnceLock<Mutex<Option<TextEmbedding>>> = OnceLock::new();

fn get_or_init_model() -> Result<&'static Mutex<Option<TextEmbedding>>, String> {
    let mutex = EMBEDDING_MODEL.get_or_init(|| Mutex::new(None));
    let mut guard = mutex
        .lock()
        .map_err(|e| format!("Mutex lock error: {}", e))?;

    if guard.is_none() {
        log::info!("[Embeddings] Initializing native FastEmbed model (BGESmallENV15)...");
        let model = TextEmbedding::try_new(
            InitOptions::new(EmbeddingModel::BGESmallENV15).with_show_download_progress(false),
        )
        .map_err(|e| format!("Failed to initialize FastEmbed model: {}", e))?;

        *guard = Some(model);
    }

    Ok(mutex)
}

#[tauri::command]
pub async fn embed_texts_rust(texts: Vec<String>) -> Result<Vec<Vec<f32>>, String> {
    if texts.is_empty() {
        return Ok(Vec::new());
    }

    // Run heavy embedding inference on a worker thread to keep the async executor responsive
    tauri::async_runtime::spawn_blocking(move || {
        let mutex = get_or_init_model()?;
        let guard = mutex
            .lock()
            .map_err(|e| format!("Mutex lock error: {}", e))?;

        if let Some(ref model) = *guard {
            let embeddings = model
                .embed(texts, None)
                .map_err(|e| format!("Embedding inference failed: {}", e))?;
            Ok(embeddings)
        } else {
            Err("Embedding model not initialized".to_string())
        }
    })
    .await
    .map_err(|e| format!("Blocking task join error: {}", e))?
}
