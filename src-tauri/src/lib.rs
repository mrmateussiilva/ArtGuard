use serde::{Deserialize, Serialize};
use tauri::Emitter;

#[derive(Debug, Serialize, Deserialize)]
pub struct Pedido {
    pub id: Option<u32>,
    pub numero: Option<String>,
    pub cliente: Option<String>,
    pub valor_total: Option<String>, // API returns string "230.00"
    pub status: Option<String>,
    pub data_entrada: Option<String>,
    pub data_entrega: Option<String>,
    pub vendedor: Option<String>,
    pub designer: Option<String>,
    pub items: Option<serde_json::Value>, // API uses 'items'
}

mod engine;
use engine::image_matcher::{find_most_similar, SimilarImageResult};
use std::path::PathBuf;

// Learn more about Tauri commands at https://tauri.app/develop/calling-rust/
#[tauri::command]
async fn buscar_pedidos(url: String) -> Result<Vec<Pedido>, String> {
    let response = reqwest::get(&url)
        .await
        .map_err(|e| format!("Erro de conexão: {}", e))?;

    if !response.status().is_success() {
        return Err(format!("Erro na API: {}", response.status()));
    }

    let body = response
        .text()
        .await
        .map_err(|e| format!("Erro ao ler corpo da resposta: {}", e))?;

    println!("Corpo recebido (tamanho: {}):", body.len());

    let pedidos: Vec<Pedido> = serde_json::from_str(&body)
        .map_err(|e| format!("Erro ao decodificar JSON: {} | Verifique o terminal para o corpo completo.", e))?;

    Ok(pedidos)
}

#[tauri::command]
async fn buscar_imagem_similar(
    reference_path: String,
    storage_path: String,
    threshold: u32
) -> Result<Option<SimilarImageResult>, String> {
    let ref_p = PathBuf::from(reference_path);
    let store_p = PathBuf::from(storage_path);
    
    // Non-blocking wrapper for CPU-heavy search
    let result = tokio::task::spawn_blocking(move || {
        find_most_similar(&ref_p, &store_p, threshold)
    }).await.map_err(|e| format!("Erro na execução da busca: {}", e))?;

    Ok(result)
}

#[derive(Clone, Serialize)]
struct ValidationPayload {
    stage: String,
    status: String,
    data: Option<serde_json::Value>,
}

#[tauri::command]
async fn validate_order(
    window: tauri::Window, 
    order_id: u32,
    image_url: String,
    storage_path: String,
    threshold: u32
) -> Result<(), String> {
    // Detect extension from URL
    let ext = image_url
        .split('?').next().unwrap_or(&image_url)
        .rsplit('.').next()
        .and_then(|e| {
            let lower = e.to_lowercase();
            if ["png", "jpg", "jpeg", "tiff", "tif", "bmp", "webp"].contains(&lower.as_str()) {
                Some(lower)
            } else {
                None
            }
        })
        .unwrap_or_else(|| "png".to_string());

    let temp_dir = std::env::temp_dir();
    let temp_path = temp_dir.join(format!("artguard_ref_{}.{}", order_id, ext));
    println!("[ArtGuard] URL da imagem: {}", image_url);
    println!("[ArtGuard] Temp path: {:?}", temp_path);
    println!("[ArtGuard] Storage path: {}", storage_path);

    // STAGE: Localizing
    window.emit("validation-stage", ValidationPayload {
        stage: "localizing".to_string(),
        status: "running".to_string(),
        data: None,
    }).map_err(|e: tauri::Error| e.to_string())?;

    let response = reqwest::get(&image_url)
        .await
        .map_err(|e| format!("Falha ao buscar imagem: {}", e))?;
    
    let bytes = response.bytes().await.map_err(|e| format!("Erro ao ler bytes: {}", e))?;
    println!("[ArtGuard] Imagem baixada: {} bytes", bytes.len());
    std::fs::write(&temp_path, &bytes).map_err(|e| format!("Erro ao salvar arquivo temp: {}", e))?;

    window.emit("validation-stage", ValidationPayload {
        stage: "localizing".to_string(),
        status: "success".to_string(),
        data: None,
    }).map_err(|e: tauri::Error| e.to_string())?;

    // STAGE: Embedding
    window.emit("validation-stage", ValidationPayload {
        stage: "embedding".to_string(),
        status: "running".to_string(),
        data: None,
    }).map_err(|e: tauri::Error| e.to_string())?;

    // Simulate some work for embedding (visual only)
    tokio::time::sleep(tokio::time::Duration::from_millis(500)).await;

    window.emit("validation-stage", ValidationPayload {
        stage: "embedding".to_string(),
        status: "success".to_string(),
        data: None,
    }).map_err(|e: tauri::Error| e.to_string())?;

    // STAGE: Comparing
    window.emit("validation-stage", ValidationPayload {
        stage: "comparing".to_string(),
        status: "running".to_string(),
        data: None,
    }).map_err(|e: tauri::Error| e.to_string())?;

    let store_p = PathBuf::from(storage_path);
    let ref_p = temp_path.clone();

    let result = tokio::task::spawn_blocking(move || {
        find_most_similar(&ref_p, &store_p, threshold)
    }).await.map_err(|e| format!("Erro na busca: {}", e))?;

    window.emit("validation-stage", ValidationPayload {
        stage: "comparing".to_string(),
        status: "success".to_string(),
        data: None,
    }).map_err(|e: tauri::Error| e.to_string())?;

    // STAGE: Scoring
    window.emit("validation-stage", ValidationPayload {
        stage: "scoring".to_string(),
        status: "running".to_string(),
        data: None,
    }).map_err(|e: tauri::Error| e.to_string())?;

    tokio::time::sleep(tokio::time::Duration::from_millis(300)).await;

    window.emit("validation-stage", ValidationPayload {
        stage: "scoring".to_string(),
        status: "success".to_string(),
        data: None,
    }).map_err(|e: tauri::Error| e.to_string())?;

    // STAGE: Finalizing
    window.emit("validation-stage", ValidationPayload {
        stage: "finalizing".to_string(),
        status: "running".to_string(),
        data: None,
    }).map_err(|e: tauri::Error| e.to_string())?;

    let (score, status) = match &result {
        Some(res) => {
            let s = if res.similarity_score >= 85.0 { "APROVADO" } else { "DIVERGENTE" };
            (res.similarity_score, s)
        },
        None => (0.0, "DIVERGENTE")
    };

    window.emit("validation-stage", ValidationPayload {
        stage: "finalizing".to_string(),
        status: "success".to_string(),
        data: Some(serde_json::json!({
            "score": score,
            "status": status,
            "match": result.map(|r| r.file_path)
        })),
    }).map_err(|e: tauri::Error| e.to_string())?;

    // Cleanup
    let _ = std::fs::remove_file(temp_path);

    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![
            buscar_pedidos, 
            buscar_imagem_similar,
            validate_order
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
