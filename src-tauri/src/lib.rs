//! Programmfenster für den osVAC neo Baukasten.
//! Die Anwendung selbst ist die Web-Oberfläche aus `dist/`; sie läuft vollständig lokal im eingebauten WebView
//! (Windows: WebView2, macOS: WKWebView, Linux: WebKitGTK). Externe Links öffnen im Standardbrowser (Plugin „opener“).
//! Dateien speichert die Oberfläche über den Befehl `save_file` in den gewählten Ordner (Plugin „dialog“ zum Auswählen).

use tauri::{ipc::InvokeBody, Manager, WebviewWindowBuilder};

/// Ordner „Downloads“ des Benutzers (unter Linux aus den XDG-Ordnern, auf Deutsch evtl. „Downloads“ oder
/// „Herunterladen“); fehlt die Angabe, ~/Downloads
fn default_dir(app: &tauri::AppHandle) -> Option<std::path::PathBuf> {
    app.path().download_dir().ok().or_else(|| app.path().home_dir().ok().map(|h| h.join("Downloads")))
}

/// Prozent-kodierten Text (encodeURIComponent) zurückwandeln; Kopfzeilen dürfen nur ASCII enthalten
fn unescape(s: &str) -> String {
    let b = s.as_bytes();
    let mut out = Vec::with_capacity(b.len());
    let mut i = 0;
    while i < b.len() {
        if b[i] == b'%' && i + 2 < b.len() {
            if let Ok(v) = u8::from_str_radix(&s[i + 1..i + 3], 16) {
                out.push(v);
                i += 3;
                continue;
            }
        }
        out.push(b[i]);
        i += 1;
    }
    String::from_utf8_lossy(&out).into_owned()
}

/// Standardordner zum Anzeigen in der Oberfläche
#[tauri::command]
fn download_dir(app: tauri::AppHandle) -> String {
    default_dir(&app).map(|d| d.to_string_lossy().into_owned()).unwrap_or_default()
}

/// Datei speichern: Inhalt roh im Körper der Anfrage, Name und Ordner (leer = Standard) in den Kopfzeilen.
/// Gibt den vollen Pfad zurück; gibt es den Namen schon, wird „Name (2).3mf“ usw. genommen.
#[tauri::command]
fn save_file(app: tauri::AppHandle, request: tauri::ipc::Request<'_>) -> Result<String, String> {
    let InvokeBody::Raw(data) = request.body() else { return Err("Keine Daten zum Speichern.".into()) };
    let head = |k: &str| request.headers().get(k).and_then(|v| v.to_str().ok()).map(unescape).unwrap_or_default();
    let name = head("x-name");
    let name = std::path::Path::new(&name).file_name().map(|n| n.to_owned()).unwrap_or_else(|| "osVAC neo Download".into());
    let dir = head("x-dir");
    let dir = if dir.is_empty() { default_dir(&app).ok_or("Kein Download-Ordner gefunden.")? } else { std::path::PathBuf::from(dir) };
    std::fs::create_dir_all(&dir).map_err(|e| format!("Ordner {} nicht erreichbar: {e}", dir.display()))?;
    let path = free_path(&dir, &name);
    std::fs::write(&path, data).map_err(|e| format!("Speichern in {} nicht möglich: {e}", dir.display()))?;
    Ok(path.to_string_lossy().into_owned())
}

/// Freier Dateiname im Ordner: „Name.3mf“, sonst „Name (2).3mf“, „Name (3).3mf“ …
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
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![save_file, download_dir])
        .setup(|app| {
            // Hauptfenster hier statt in tauri.conf.json, damit auch Downloads über Links überall ankommen (die Oberfläche
            // speichert sonst selbst über save_file): WebView2 (Windows) speichert selbst in „Downloads“; WKWebView und
            // WebKitGTK brauchen ein Ziel, sonst landet die Datei im Arbeitsordner des Programms (Linux) bzw. wird gar
            // nicht gespeichert (macOS).
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
                use tauri::webview::DownloadEvent;
                let dir = default_dir(app.handle());
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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn unescape_wandelt_zurueck() {
        assert_eq!(unescape("osVAC%20neo%20M25%20%E2%86%92%2062%C3%9738.3mf"), "osVAC neo M25 → 62×38.3mf");
        assert_eq!(unescape("C%3A%5CBenutzer%5CPeter%5CDrucke"), "C:\\Benutzer\\Peter\\Drucke");
        assert_eq!(unescape("100%"), "100%");
    }

    #[test]
    fn freier_name() {
        let dir = std::env::temp_dir().join("osvacneo-test-free-path");
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).unwrap();
        let n = std::ffi::OsStr::new("A.3mf");
        assert_eq!(free_path(&dir, n), dir.join("A.3mf"));
        std::fs::write(dir.join("A.3mf"), b"x").unwrap();
        assert_eq!(free_path(&dir, n), dir.join("A (2).3mf"));
        let _ = std::fs::remove_dir_all(&dir);
    }
}
