use crate::models::image_index::ImageIndex;
use crate::indexer::hasher::generate_hashes;
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

#[tauri::command]
pub async fn validate_order(
    window: tauri::Window,
    order_id: u32,
    image_url: String,
    storage_path: String,
    threshold_approved: f32,
    threshold_attention: f32,
) -> Result<(), String> {
    println!("[ArtGuard] Iniciando validação para Pedido #{}", order_id);
    println!("[ArtGuard] URL: {}", image_url);
    println!("[ArtGuard] Pasta: {}", storage_path);

    // Stage helpers
    let emit_stage = |stage: &str, status: &str, data: Option<serde_json::Value>| {
        window.emit("validation-stage", ValidationPayload {
            stage: stage.to_string(),
            status: status.to_string(),
            data,
        }).map_err(|e| e.to_string())
    };

    // Detect extension
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

    // 1. Downloading
    emit_stage("downloading", "running", None)?;
    let response = reqwest::get(&image_url).await
        .map_err(|e| {
            let msg = format!("Falha no download: {}", e);
            let _ = emit_stage("downloading", "error", None);
            msg
        })?;
    
    let bytes = response.bytes().await
        .map_err(|e| {
            let msg = format!("Falha ao ler bytes: {}", e);
            let _ = emit_stage("downloading", "error", None);
            msg
        })?;
    
    println!("[ArtGuard] Download concluído ({} bytes)", bytes.len());

    let temp_dir = std::env::temp_dir();
    let temp_path = temp_dir.join(format!("artguard_ref_{}.{}", order_id, ext));
    std::fs::write(&temp_path, &bytes).map_err(|e| {
        let msg = format!("Falha ao salvar temp: {}", e);
        let _ = emit_stage("downloading", "error", None);
        msg
    })?;
    emit_stage("downloading", "success", None)?;

    // 2. Normalizing & Hashing
    println!("[ArtGuard] Gerando hashes da referência...");
    emit_stage("normalizing", "running", None)?;
    emit_stage("hashing", "running", None)?;
    
    let (target_hashes, _, _) = crate::indexer::hasher::generate_hashes_from_memory(&bytes).map_err(|e| {
        let _ = emit_stage("normalizing", "error", None);
        let _ = emit_stage("hashing", "error", None);
        format!("Erro no processamento da imagem: {}", e)
    })?;
    
    emit_stage("normalizing", "success", None)?;
    emit_stage("hashing", "success", None)?;

    // Log the temp file for reference (optional)
    let temp_dir = std::env::temp_dir();
    let temp_path = temp_dir.join(format!("artguard_ref_{}.bin", order_id));
    let _ = std::fs::write(&temp_path, &bytes);

    // 3. Loading Index
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

    // 4. Matching & Scoring
    println!("[ArtGuard] Buscando correspondências...");
    emit_stage("matching", "running", None)?;
    emit_stage("scoring", "running", None)?;
    
    let match_result = find_match(&index, &target_hashes);
    
    emit_stage("matching", "success", None)?;
    emit_stage("scoring", "success", None)?;

    // 5. Finalizing
    emit_stage("finalizing", "running", None)?;
    
    let result_data = match match_result {
        Some(res) => {
            let status = if res.score >= threshold_approved { 
                "approved" 
            } else if res.score >= threshold_attention {
                "attention"
            } else { 
                "divergent" 
            };
            
            println!("[ArtGuard] Match encontrado: {} (Score: {:.1}%, Status: {})", res.metadata.name, res.score, status);
            serde_json::json!({
                "status": status,
                "score": res.score,
                "matched_file": res.metadata.name,
                "match_type": res.match_type
            })
        },
        None => {
            println!("[ArtGuard] Nenhum match encontrado.");
            serde_json::json!({
                "status": "divergent",
                "score": 0.0,
                "matched_file": null
            })
        }
    };

    emit_stage("finalizing", "success", Some(result_data))?;

    // Cleanup
    let _ = std::fs::remove_file(temp_path);
    println!("[ArtGuard] Validação finalizada.");

    Ok(())
}
