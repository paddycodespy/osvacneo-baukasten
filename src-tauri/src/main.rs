// Unter Windows kein zusätzliches Konsolenfenster im fertigen Programm
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    osvacneo_lib::run();
}
