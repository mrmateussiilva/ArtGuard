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
    threshold: u32,
) -> Result<(), String> {
    // Stage helpers
    let emit_stage = |stage: &str, status: &str, data: Option<serde_json::Value>| {
        window.emit("validation-stage", ValidationPayload {
            stage: stage.to_string(),
            status: status.to_string(),
            data,
        }).map_err(|e| e.to_string())
    };

    // 1. Downloading
    emit_stage("downloading", "running", None)?;
    let response = reqwest::get(&image_url).await
        .map_err(|e| format!("Failed to download reference: {}", e))?;
    let bytes = response.bytes().await
        .map_err(|e| format!("Failed to read bytes: {}", e))?;
    
    let temp_dir = std::env::temp_dir();
    let temp_path = temp_dir.join(format!("artguard_ref_{}.png", order_id));
    std::fs::write(&temp_path, &bytes).map_err(|e| format!("Failed to save temp file: {}", e))?;
    emit_stage("downloading", "success", None)?;

    // 2. Normalizing & Hashing
    emit_stage("normalizing", "running", None)?;
    emit_stage("hashing", "running", None)?;
    let (target_hashes, _, _) = generate_hashes(&temp_path)?;
    emit_stage("normalizing", "success", None)?;
    emit_stage("hashing", "success", None)?;

    // 3. Loading Index
    emit_stage("loading_index", "running", None)?;
    let index_path = Path::new(&storage_path).join("index.json");
    if !index_path.exists() {
        return Err("Index not found. Please index the folder first.".to_string());
    }
    let index_str = std::fs::read_to_string(index_path)
        .map_err(|e| format!("Failed to read index: {}", e))?;
    let index: ImageIndex = serde_json::from_str(&index_str)
        .map_err(|e| format!("Failed to parse index: {}", e))?;
    emit_stage("loading_index", "success", None)?;

    // 4. Matching & Scoring
    emit_stage("matching", "running", None)?;
    emit_stage("scoring", "running", None)?;
    
    let match_result = find_match(&index, &target_hashes);
    
    emit_stage("matching", "success", None)?;
    emit_stage("scoring", "success", None)?;

    // 5. Finalizing
    emit_stage("finalizing", "running", None)?;
    
    let result_data = match match_result {
        Some(res) => {
            let status = if res.score >= threshold as f32 { "approved" } else { "divergent" };
            serde_json::json!({
                "status": status,
                "score": res.score,
                "matched_file": res.metadata.name,
                "match_type": res.match_type
            })
        },
        None => serde_json::json!({
            "status": "divergent",
            "score": 0.0,
            "matched_file": null
        })
    };

    emit_stage("finalizing", "success", Some(result_data))?;

    // Cleanup
    let _ = std::fs::remove_file(temp_path);

    Ok(())
}
