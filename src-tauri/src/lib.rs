//! Programmfenster für den osVAC neo Konfigurator.
//! Die Anwendung selbst ist die Web-Oberfläche aus `dist/`; sie läuft vollständig lokal
//! im eingebauten WebView2 (Edge). Externe Links öffnen im Standardbrowser (Plugin „opener“).

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .run(tauri::generate_context!())
        .expect("Fehler beim Starten des osVAC neo Konfigurators");
}
