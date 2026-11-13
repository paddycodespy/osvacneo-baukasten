// Unter Windows kein zusätzliches Konsolenfenster im fertigen Programm
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    // Linux: WebKitGTK zeigt mit manchen Grafiktreibern (z. B. NVIDIA, Wayland) nur ein leeres Fenster, solange der
    // DMA-BUF-Renderer an ist. Abschalten kostet hier nichts (die Vorschau rechnet über WebGL).
    #[cfg(target_os = "linux")]
    if std::env::var_os("WEBKIT_DISABLE_DMABUF_RENDERER").is_none() {
        std::env::set_var("WEBKIT_DISABLE_DMABUF_RENDERER", "1");
    }
    osvacneo_lib::run();
}
