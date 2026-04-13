use notify::{Config, Event, EventKind, RecommendedWatcher, RecursiveMode, Watcher};
use std::path::Path;
use std::sync::Mutex;
use tauri::{AppHandle, Emitter, State};

pub struct WatcherState(pub Mutex<Option<RecommendedWatcher>>);

#[tauri::command]
fn start_watching(
    app_handle: AppHandle,
    path: String,
    state: State<WatcherState>,
) -> Result<(), String> {
    let mut guard = state.0.lock().map_err(|e| e.to_string())?;
    // Drop existing watcher before starting a new one
    *guard = None;

    let handle = app_handle.clone();
    let mut watcher = RecommendedWatcher::new(
        move |res: Result<Event, notify::Error>| {
            if let Ok(event) = res {
                match event.kind {
                    EventKind::Create(_)
                    | EventKind::Remove(_)
                    | EventKind::Modify(notify::event::ModifyKind::Name(_)) => {
                        let has_mp4 = event.paths.iter().any(|p| {
                            p.extension()
                                .and_then(|e| e.to_str())
                                .map(|e| e.eq_ignore_ascii_case("mp4"))
                                .unwrap_or(false)
                        });
                        if has_mp4 {
                            let _ = handle.emit("folder-changed", ());
                        }
                    }
                    _ => {}
                }
            }
        },
        Config::default(),
    )
    .map_err(|e| e.to_string())?;

    watcher
        .watch(Path::new(&path), RecursiveMode::NonRecursive)
        .map_err(|e| e.to_string())?;

    *guard = Some(watcher);
    Ok(())
}

#[tauri::command]
fn stop_watching(state: State<WatcherState>) -> Result<(), String> {
    let mut guard = state.0.lock().map_err(|e| e.to_string())?;
    *guard = None;
    Ok(())
}

#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust!", name)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_sql::Builder::new().build())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_opener::init())
        .manage(WatcherState(Mutex::new(None)))
        .invoke_handler(tauri::generate_handler![
            greet,
            start_watching,
            stop_watching
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
