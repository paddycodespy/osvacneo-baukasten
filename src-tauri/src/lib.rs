//! Programmfenster für den osVAC neo Baukasten.
//! Die Anwendung selbst ist die Web-Oberfläche aus `dist/`; sie läuft vollständig lokal im eingebauten WebView
//! (Windows: WebView2, macOS: WKWebView, Linux: WebKitGTK). Externe Links öffnen im Standardbrowser (Plugin „opener“).

use tauri::WebviewWindowBuilder;

/// Freier Dateiname im Ordner: „Name.3mf“, sonst „Name (2).3mf“, „Name (3).3mf“ …
#[cfg(not(windows))]
fn free_path(dir: &std::path::Path, name: &std::ffi::OsStr) -> std::path::PathBuf {
    let first = dir.join(name);
    if !first.exists() {
        return first;
    }
    let p = std::path::Path::new(name);
    let stem = p.file_stem().map(|s| s.to_string_lossy().into_owned()).unwrap_or_default();
    let ext = p.extension().map(|e| format!(".{}", e.to_string_lossy())).unwrap_or_default();
    (2..1000)
        .map(|i| dir.join(format!("{stem} ({i}){ext}")))
        .find(|c| !c.exists())
        .unwrap_or(first)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .setup(|app| {
            // Hauptfenster hier statt in tauri.conf.json, damit Downloads überall ankommen: WebView2 (Windows) speichert
            // selbst in „Downloads“; WKWebView und WebKitGTK brauchen ein Ziel, sonst landet die Datei im Arbeitsordner
            // des Programms (Linux) bzw. wird gar nicht gespeichert (macOS).
            let cfg = app
                .config()
                .app
                .windows
                .iter()
                .find(|w| w.label == "main")
                .cloned()
                .expect("Hauptfenster fehlt in tauri.conf.json");
            let builder = WebviewWindowBuilder::from_config(app.handle(), &cfg)?;
            #[cfg(not(windows))]
            let builder = {
                use tauri::{webview::DownloadEvent, Manager};
                // Ordner „Downloads“ des Benutzers (unter Linux aus den XDG-Ordnern, auf Deutsch evtl. „Downloads“ oder
                // „Herunterladen“); fehlt die Angabe, ~/Downloads
                let dir = app.path().download_dir().ok().or_else(|| app.path().home_dir().ok().map(|h| h.join("Downloads")));
                builder.on_download(move |_webview, event| {
                    if let DownloadEvent::Requested { destination, .. } = event {
                        if let Some(dir) = &dir {
                            let _ = std::fs::create_dir_all(dir);
                            let name = destination
                                .file_name()
                                .map(|n| n.to_owned())
                                .unwrap_or_else(|| std::ffi::OsString::from("osVAC neo Download"));
                            *destination = free_path(dir, &name);
                        }
                    }
                    true
                })
            };
            builder.build()?;
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("Fehler beim Starten des osVAC neo Baukastens");
}
