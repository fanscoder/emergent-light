mod desktop;
mod host_discovery;
mod power;
use std::sync::Mutex;
use tauri::menu::{CheckMenuItem, Menu, MenuItem, PredefinedMenuItem};
use tauri::tray::{TrayIconBuilder, TrayIconEvent, MouseButton, MouseButtonState};
use tauri::{Emitter, Manager, State};
use tauri_plugin_autostart::{MacosLauncher, ManagerExt as AutostartManagerExt};
use tauri_plugin_global_shortcut::{Code, GlobalShortcutExt, Modifiers, Shortcut, ShortcutState};

#[derive(Default)]
struct WallpaperState { attachment: Mutex<Option<desktop::Attachment>>, autostart_item: Mutex<Option<CheckMenuItem<tauri::Wry>>> }

fn apply_wallpaper(app: &tauri::AppHandle, on: bool) -> Result<(), String> {
    let state = app.state::<WallpaperState>();
    let mut attachment = state.attachment.lock().map_err(|e| e.to_string())?;
    if attachment.is_some() == on { return Ok(()); }
    let window = app.get_webview_window("main").ok_or("主窗口不存在")?;
    let hwnd = window.hwnd().map_err(|e| e.to_string())?.0;
    if on {
        // Publish only after a successful attach. No transparent fullscreen fallback.
        // Keep Tao's cached window flags consistent with native styles. Otherwise
        // later cursor/taskbar updates can reintroduce the original frame.
        window.set_shadow(false).map_err(|e| e.to_string())?;
        window.set_decorations(false).map_err(|e| e.to_string())?;
        if let Err(e) = window.set_skip_taskbar(true) {
            let _ = window.set_decorations(true);
            let _ = window.set_shadow(true);
            return Err(e.to_string());
        }
        // Finish Tao updates before native reparenting; they recompute styles.
        if let Err(e) = window.set_ignore_cursor_events(true) {
            let _ = window.set_skip_taskbar(false);
            let _ = window.set_decorations(true);
            let _ = window.set_shadow(true);
            return Err(e.to_string());
        }
        let saved = match desktop::attach(hwnd) {
            Ok(saved) => saved,
            Err(error) => {
                let _ = window.set_ignore_cursor_events(false);
                let _ = window.set_skip_taskbar(false);
                let _ = window.set_decorations(true);
            let _ = window.set_shadow(true);
                return Err(error);
            }
        };
        *attachment = Some(saved);
    } else {
        let saved = attachment.as_ref().copied().ok_or("壁纸状态不存在")?;
        desktop::detach(hwnd, saved)?;
        *attachment = None;
        // Synchronize the frontend even if a nonessential focus operation fails.
        let _ = app.emit("wallpaper-changed", false);
        window.set_ignore_cursor_events(false).map_err(|e| e.to_string())?;
        window.set_skip_taskbar(false).map_err(|e| e.to_string())?;
        window.set_decorations(true).map_err(|e| e.to_string())?;
        window.set_shadow(true).map_err(|e| e.to_string())?;
        window.show().map_err(|e| e.to_string())?;
        window.set_focus().map_err(|e| e.to_string())?;
    }
    drop(attachment);
    let _ = app.emit("wallpaper-changed", on);
    Ok(())
}

fn report(app: &tauri::AppHandle, result: Result<(), String>) {
    if let Err(error) = result { let _ = app.emit("desktop-error", error); }
}

#[tauri::command]
fn set_wallpaper(on: bool, app: tauri::AppHandle) -> Result<(), String> { apply_wallpaper(&app, on) }
#[tauri::command]
fn is_wallpaper(state: State<'_, WallpaperState>) -> bool { state.attachment.lock().unwrap().is_some() }
#[tauri::command]
fn should_start_wallpaper() -> bool { std::env::args().any(|arg| arg == "--autostart") }

#[tauri::command]
fn desktop_pointer(app: tauri::AppHandle, state: State<'_, WallpaperState>) -> Option<(f64, f64)> {
    if state.attachment.lock().ok()?.is_none() { return None; }
    let w = app.get_webview_window("main")?;
    desktop::pointer(w.hwnd().ok()?.0)
}

#[tauri::command]
fn get_startup(app: tauri::AppHandle) -> Result<bool, String> {
    app.autolaunch().is_enabled().map_err(|e| e.to_string())
}
#[tauri::command]
fn set_startup(on: bool, app: tauri::AppHandle) -> Result<(), String> {
    let auto=app.autolaunch();
    if on { auto.enable() } else { auto.disable() }.map_err(|e| e.to_string())?;
    if let Some(item)=app.state::<WallpaperState>().autostart_item.lock().unwrap().as_ref() { let _=item.set_checked(on); }
    let _=app.emit("startup-changed", on); Ok(())
}

#[tauri::command]
fn power_status(app: tauri::AppHandle, state: State<'_, WallpaperState>) -> Result<u8,String> {
    let wallpaper=state.attachment.lock().map_err(|e|e.to_string())?.is_some();
    let window=app.get_webview_window("main").ok_or("主窗口不存在")?;
    Ok(power::status(window.hwnd().map_err(|e|e.to_string())?.0,wallpaper))
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_global_shortcut::Builder::new().build())
        .plugin(tauri_plugin_autostart::init(MacosLauncher::LaunchAgent, Some(vec!["--autostart"])))
        .manage(WallpaperState::default())
        .invoke_handler(tauri::generate_handler![set_wallpaper, is_wallpaper, should_start_wallpaper, desktop_pointer, get_startup, set_startup, power_status])
        .setup(|app| {
            if let Some(window)=app.get_webview_window("main") { power::watch(window.hwnd()?.0); }
            let wallpaper = MenuItem::with_id(app, "wallpaper", "进入桌面壁纸", true, None::<&str>)?;
            let settings = MenuItem::with_id(app, "settings", "打开设置 / 预览", true, None::<&str>)?;
            let autostart = CheckMenuItem::with_id(app, "autostart", "开机自启", true,
                app.autolaunch().is_enabled().unwrap_or(false), None::<&str>)?;
            *app.state::<WallpaperState>().autostart_item.lock().unwrap()=Some(autostart.clone());
            let menu = Menu::with_items(app, &[&wallpaper, &settings, &autostart,
                &PredefinedMenuItem::separator(app)?, &PredefinedMenuItem::quit(app, None)?])?;
            TrayIconBuilder::with_id("desktop-tray")
                .icon(app.default_window_icon().unwrap().clone())
                .menu(&menu).show_menu_on_left_click(false)
                .tooltip("Emergent Light — 单击打开设置，右键切换壁纸")
                .on_tray_icon_event(|tray, event| {
                    if let TrayIconEvent::Click { button: MouseButton::Left, button_state: MouseButtonState::Up, .. } = event {
                        let app = tray.app_handle();
                        report(app, apply_wallpaper(app, false));
                        if let Some(w) = app.get_webview_window("main") {
                            let _ = w.show(); let _ = w.set_focus();
                        }
                    }
                })
                .on_menu_event(move |app, event| match event.id().as_ref() {
                    "wallpaper" => report(app, apply_wallpaper(app, true)),
                    "settings" => {
                        report(app, apply_wallpaper(app, false));
                        if let Some(w) = app.get_webview_window("main") { let _ = w.show(); let _ = w.set_focus(); }
                    },
                    "autostart" => {
                        let auto = app.autolaunch();
                        let next = !auto.is_enabled().unwrap_or(false);
                        report(app, set_startup(next, app.clone()));
                    },
                    _ => {}
                }).build(app)?;
            let shortcut = Shortcut::new(Some(Modifiers::CONTROL | Modifiers::ALT), Code::KeyP);
            app.global_shortcut().on_shortcut(shortcut, |app, _, event| {
                if event.state == ShortcutState::Pressed {
                    let on = !app.state::<WallpaperState>().attachment.lock().unwrap().is_some();
                    report(app, apply_wallpaper(app, on));
                }
            })?;
            Ok(())
        })
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                api.prevent_close();
                report(window.app_handle(), apply_wallpaper(window.app_handle(), true));
            }
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
