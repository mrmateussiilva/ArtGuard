use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize, Deserialize)]
pub struct Pedido {
    pub id: Option<u32>,
    pub cliente: Option<String>,
    pub valor: Option<f64>,
    pub status: Option<String>,
}

// Learn more about Tauri commands at https://tauri.app/develop/calling-rust/
#[tauri::command]
async fn buscar_pedidos(url: String) -> Result<Vec<Pedido>, String> {
    let response = reqwest::get(&url)
        .await
        .map_err(|e| e.to_string())?;

    if !response.status().is_success() {
        return Err(format!("Erro na API: {}", response.status()));
    }

    let pedidos = response
        .json::<Vec<Pedido>>()
        .await
        .map_err(|e| e.to_string())?;

    Ok(pedidos)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![buscar_pedidos])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
