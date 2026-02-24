use crate::models::image_index::ImageIndex;
use crate::validator::matcher::find_match;
use tauri::Emitter;
use serde::Serialize;
use std::path::Path;

#[derive(Clone, Serialize)]
struct ValidationPayload {
    stage: String,
    status: String,
    data: Option<serde_json::Value>,
}

#[derive(Serialize)]
struct ItemResult {
    url: String,
    status: String,
    score: f32,
    matched_file: Option<String>,
}

#[tauri::command]
pub async fn validate_order(
    window: tauri::Window,
    order_id: u32,
    image_urls: Vec<String>,
    storage_path: String,
    threshold_approved: f32,
    threshold_attention: f32,
) -> Result<(), String> {
    println!("[ArtGuard] Iniciando validação MULTI-ITEM para Pedido #{}", order_id);
    println!("[ArtGuard] Quantidade de itens: {}", image_urls.len());
    println!("[ArtGuard] Pasta: {}", storage_path);

    // Stage helpers
    let emit_stage = |stage: &str, status: &str, data: Option<serde_json::Value>| {
        window.emit("validation-stage", ValidationPayload {
            stage: stage.to_string(),
            status: status.to_string(),
            data,
        }).map_err(|e| e.to_string())
    };

    // 1. Loading Index (Only once)
    println!("[ArtGuard] Carregando índice local...");
    emit_stage("loading_index", "running", None)?;
    let index_path = Path::new(&storage_path).join("index.json");
    if !index_path.exists() {
        let _ = emit_stage("loading_index", "error", None);
        return Err("Índice não encontrado. Execute a sincronização primeiro.".to_string());
    }
    let index_str = std::fs::read_to_string(index_path)
        .map_err(|e| {
            let _ = emit_stage("loading_index", "error", None);
            format!("Erro ao ler índice: {}", e)
        })?;
    let index: ImageIndex = serde_json::from_str(&index_str)
        .map_err(|e| {
            let _ = emit_stage("loading_index", "error", None);
            format!("Erro ao processar índice: {}", e)
        })?;
    emit_stage("loading_index", "success", None)?;

    let mut item_results = Vec::new();
    let total_items = image_urls.len();

    for (idx, image_url) in image_urls.iter().enumerate() {
        println!("[ArtGuard] Processando item {}/{}...", idx + 1, total_items);
        
        // Use a generic stage for multi-item progress if needed, 
        // but for now we'll reuse the existing stages and just update them per item.
        // The frontend will see the progress bar reset/advance for each item.
        
        // Detect extension
        let ext = image_url
            .split('?').next().unwrap_or(image_url)
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

        // 2. Downloading
        emit_stage("downloading", "running", None)?;
        let response = reqwest::get(image_url).await
            .map_err(|e| {
                let _ = emit_stage("downloading", "error", None);
                format!("Falha no download do item {}: {}", idx + 1, e)
            })?;
        
        let bytes = response.bytes().await
            .map_err(|e| {
                let _ = emit_stage("downloading", "error", None);
                format!("Falha ao ler bytes do item {}: {}", idx + 1, e)
            })?;
        
        emit_stage("downloading", "success", None)?;

        // 3. Normalizing & Hashing
        emit_stage("normalizing", "running", None)?;
        emit_stage("hashing", "running", None)?;
        
        let target_hashes = match crate::indexer::hasher::generate_hashes_from_memory(&bytes) {
            Ok((h, _, _)) => {
                emit_stage("normalizing", "success", None)?;
                emit_stage("hashing", "success", None)?;
                h
            },
            Err(e) => {
                let _ = emit_stage("normalizing", "error", None);
                let _ = emit_stage("hashing", "error", None);
                println!("[ArtGuard] Erro ao processar item {}: {}", idx + 1, e);
                // Continue with a dummy hash or return error? Let's return error for safety.
                return Err(format!("Erro no processamento da imagem {}: {}", idx + 1, e));
            }
        };

        // 4. Matching & Scoring
        emit_stage("matching", "running", None)?;
        emit_stage("scoring", "running", None)?;
        
        let match_result = find_match(&index, &target_hashes);
        
        emit_stage("matching", "success", None)?;
        emit_stage("scoring", "success", None)?;

        match match_result {
            Some(res) => {
                let status = if res.score >= threshold_approved { "approved" }
                             else if res.score >= threshold_attention { "attention" }
                             else { "divergent" };
                
                item_results.push(ItemResult {
                    url: image_url.clone(),
                    status: status.to_string(),
                    score: res.score,
                    matched_file: Some(res.metadata.name),
                });
            },
            None => {
                item_results.push(ItemResult {
                    url: image_url.clone(),
                    status: "divergent".to_string(),
                    score: 0.0,
                    matched_file: None,
                });
            }
        }
    }

    // 5. Finalizing - Calculate AGGREGATE result
    emit_stage("finalizing", "running", None)?;
    
    let total_score: f32 = item_results.iter().map(|r| r.score).sum();
    let avg_score = total_score / (total_items as f32);
    
    // Status is determined by the "worst" item status for maximal safety
    let mut status = "approved";
    if item_results.iter().any(|r| r.status == "divergent") {
        status = "divergent";
    } else if item_results.iter().any(|r| r.status == "attention") {
        status = "attention";
    }

    let result_data = serde_json::json!({
        "status": status,
        "score": avg_score,
        "items": item_results,
        "total_items": total_items
    });

    emit_stage("finalizing", "success", Some(result_data))?;

    println!("[ArtGuard] Validação MULTI-ITEM finalizada. Status: {}", status);

    Ok(())
}
