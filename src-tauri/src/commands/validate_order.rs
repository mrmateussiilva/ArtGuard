use crate::config;
use crate::models::image_index::ImageIndex;
use crate::utils::dpi::read_dpi_from_bytes;
use crate::validator::matcher::find_match_with_min_score;
use log::{error, info};
use tauri::{Emitter, Manager};
use serde::Serialize;
use std::path::Path;
use std::time::Duration;

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
    /// DPI X (quando disponível nos metadados).
    dpi_x: Option<f32>,
    /// DPI Y (quando disponível nos metadados).
    dpi_y: Option<f32>,
    /// Resolução OK segundo min_dpi (true se DPI >= min_dpi ou se DPI não informado).
    dpi_ok: bool,
    /// Medida OK quando pedido informa largura/altura em cm e DPI está disponível.
    measure_ok: Option<bool>,
}

/// Medidas em cm por item (largura_cm, altura_cm), na mesma ordem que image_urls. Opcional.
#[tauri::command]
pub async fn validate_order(
    window: tauri::Window,
    order_id: u32,
    image_urls: Vec<String>,
    storage_path: String,
    threshold_approved: f32,
    threshold_attention: f32,
    item_measures_cm: Option<Vec<(f32, f32)>>,
) -> Result<(), String> {
    info!("Iniciando validação MULTI-ITEM para Pedido #{}", order_id);
    info!("Quantidade de itens: {}", image_urls.len());
    info!("Pasta: {}", storage_path);

    // Stage helpers
    let emit_stage = |stage: &str, status: &str, data: Option<serde_json::Value>| {
        window.emit("validation-stage", ValidationPayload {
            stage: stage.to_string(),
            status: status.to_string(),
            data,
        }).map_err(|e| e.to_string())
    };

    // 1. Loading Index (Only once)
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

    let app_config = config::get_config_path(&window.app_handle())
        .ok()
        .map(|p| config::load_config(&p))
        .unwrap_or_else(|| config::AppConfig::default());
    let min_match_score = app_config.validation.min_match_score;
    let min_dpi = app_config.validation.min_dpi;

    let mut item_results = Vec::new();
    let total_items = image_urls.len();

    for (idx, image_url) in image_urls.iter().enumerate() {
        info!("Processando item {}/{}", idx + 1, total_items);

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

        // 2. Downloading (with retry and backoff)
        emit_stage("downloading", "running", None)?;
        const MAX_ATTEMPTS: u32 = 3;
        const INITIAL_BACKOFF_MS: u64 = 1000;
        let mut last_err = String::new();
        let mut bytes = None;
        for attempt in 0..MAX_ATTEMPTS {
            match reqwest::get(image_url.as_str()).await {
                Ok(response) => match response.bytes().await {
                    Ok(b) => {
                        bytes = Some(b);
                        break;
                    }
                    Err(e) => last_err = e.to_string(),
                },
                Err(e) => last_err = e.to_string(),
            }
            if attempt < MAX_ATTEMPTS - 1 {
                let delay_ms = INITIAL_BACKOFF_MS * (1 << attempt);
                tokio::time::sleep(Duration::from_millis(delay_ms)).await;
            }
        }
        let bytes = bytes.ok_or_else(|| {
            let _ = emit_stage("downloading", "error", None);
            format!(
                "Falha no download do item {} após {} tentativas: {}",
                idx + 1, MAX_ATTEMPTS, last_err
            )
        })?;

        emit_stage("downloading", "success", None)?;

        // 2b. DPI da imagem (para validação de resolução)
        let (dpi_x, dpi_y) = read_dpi_from_bytes(&bytes, Some(ext.as_str()))
            .map(|(x, y)| (Some(x), Some(y)))
            .unwrap_or((None, None));
        let dpi_ok = match (dpi_x, dpi_y) {
            (Some(x), Some(y)) => x >= min_dpi as f32 && y >= min_dpi as f32,
            _ => true, // sem DPI nos metadados: não falhar
        };

        // 3. Normalizing & Hashing
        emit_stage("normalizing", "running", None)?;
        emit_stage("hashing", "running", None)?;
        
        let (target_hashes, width_px, height_px) = match crate::indexer::hasher::generate_hashes_from_memory(&bytes) {
            Ok((h, w, ht)) => {
                emit_stage("normalizing", "success", None)?;
                emit_stage("hashing", "success", None)?;
                (h, w, ht)
            },
            Err(e) => {
                let _ = emit_stage("normalizing", "error", None);
                let _ = emit_stage("hashing", "error", None);
                error!("Erro ao processar item {}: {}", idx + 1, e);
                return Err(format!("Erro no processamento da imagem {}: {}", idx + 1, e));
            }
        };

        // 4. Matching & Scoring
        emit_stage("matching", "running", None)?;
        emit_stage("scoring", "running", None)?;
        
        let match_result = find_match_with_min_score(&index, &target_hashes, min_match_score);
        
        emit_stage("matching", "success", None)?;
        emit_stage("scoring", "success", None)?;

        // Medida em cm: pixels necessários = cm * DPI / 2.54
        let measure_ok = item_measures_cm.as_ref().and_then(|m| m.get(idx)).and_then(|&(width_cm, height_cm)| {
            let (dx, dy) = (dpi_x?, dpi_y?);
            let required_w = (width_cm * dx / 2.54).ceil() as u32;
            let required_h = (height_cm * dy / 2.54).ceil() as u32;
            Some(width_px >= required_w && height_px >= required_h)
        });

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
                    dpi_x,
                    dpi_y,
                    dpi_ok,
                    measure_ok,
                });
            },
            None => {
                item_results.push(ItemResult {
                    url: image_url.clone(),
                    status: "divergent".to_string(),
                    score: 0.0,
                    matched_file: None,
                    dpi_x,
                    dpi_y,
                    dpi_ok,
                    measure_ok,
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

    info!("Validação MULTI-ITEM finalizada. Status: {}", status);

    Ok(())
}
