use crate::models::image_index::{ImageIndex, ImageMetadata, ComparisonResult};
use crate::indexer::hasher::generate_hashes_from_memory;
use tauri::{AppHandle, Emitter};
use std::path::Path;
use std::fs;
use base64::{Engine as _, engine::general_purpose};

#[tauri::command]
pub async fn read_image_as_base64(path: String) -> Result<String, String> {
    let bytes = fs::read(&path).map_err(|e| format!("Failed to read file: {}", e))?;
    let ext = Path::new(&path)
        .extension()
        .and_then(|e| e.to_str())
        .unwrap_or("jpeg")
        .to_lowercase();
    let mime = match ext.as_str() {
        "png" => "image/png",
        "gif" => "image/gif",
        "webp" => "image/webp",
        _ => "image/jpeg",
    };
    let encoded = general_purpose::STANDARD.encode(&bytes);
    Ok(format!("data:{};base64,{}", mime, encoded))
}

#[tauri::command]
pub async fn get_index_images(storage_path: String) -> Result<Vec<ImageMetadata>, String> {
    let path = Path::new(&storage_path).join("index.json");
    if !path.exists() {
        return Err("Index file not found in the specified storage path".to_string());
    }

    let content = fs::read_to_string(path).map_err(|e| format!("Failed to read index: {}", e))?;
    let index: ImageIndex = serde_json::from_str(&content).map_err(|e| format!("Failed to parse index: {}", e))?;

    Ok(index.images)
}

#[tauri::command]
pub async fn compare_single_image(
    app: AppHandle,
    reference_url: String,
    indexed_image: ImageMetadata,
    threshold: Option<f64>
) -> Result<ComparisonResult, String> {
    let threshold = threshold.unwrap_or(85.0);

    // 1. Downloading
    app.emit("validation-stage", "downloading").ok();
    let response = reqwest::get(&reference_url)
        .await
        .map_err(|e| format!("Failed to download reference image: {}", e))?;
    
    let bytes = response.bytes().await.map_err(|e| format!("Failed to get image bytes: {}", e))?;

    // 2. Hashing
    app.emit("validation-stage", "hashing").ok();
    let (target_hashes, _width, _height) = generate_hashes_from_memory(&bytes)?;

    // 3. Matching
    app.emit("validation-stage", "matching").ok();
    
    // Exact SHA256 match
    if target_hashes.sha256 == indexed_image.sha256 {
        app.emit("validation-stage", "done").ok();
        return Ok(ComparisonResult {
            score: 100.0,
            status: "approved".to_string(),
            matched_file: indexed_image.name,
        });
    }

    // 4. Scoring
    app.emit("validation-stage", "scoring").ok();
    let target_phash = u64::from_str_radix(&target_hashes.phash, 16)
        .map_err(|e| format!("Failed to parse target phash: {}", e))?;
    let indexed_phash = u64::from_str_radix(&indexed_image.phash, 16)
        .map_err(|e| format!("Failed to parse indexed phash: {}", e))?;

    let distance = (target_phash ^ indexed_phash).count_ones();
    let score = 100.0 - ((distance as f64 / 64.0) * 100.0);
    
    let status = if score >= threshold {
        "approved".to_string()
    } else {
        "divergent".to_string()
    };

    app.emit("validation-stage", "done").ok();

    Ok(ComparisonResult {
        score,
        status,
        matched_file: indexed_image.name,
    })
}
