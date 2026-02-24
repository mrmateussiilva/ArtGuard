use crate::config::{self, AppConfig};
use tauri::Manager;

#[tauri::command]
pub async fn get_config(app_handle: tauri::AppHandle) -> Result<AppConfig, String> {
    let path = config::get_config_path(&app_handle)?;
    Ok(config::load_config(&path))
}

#[tauri::command]
pub async fn save_config(app_handle: tauri::AppHandle, config: AppConfig) -> Result<(), String> {
    let path = config::get_config_path(&app_handle)?;
    config::save_config(&path, &config)
}
