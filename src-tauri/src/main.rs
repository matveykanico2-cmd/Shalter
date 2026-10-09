// Нативное десктоп-приложение Shalter на Tauri: окно с живым сервером (как Telegram
// Desktop поверх веб-версии), но без встроенного Chromium — страницу рисует движок
// системы (WebKit на Linux/macOS, WebView2 на Windows). Трей со счётчиком
// непрочитанных, бейдж на иконке, уведомления, один экземпляр, ссылки shalter://,
// запоминание окна и экран «нет связи» с автоповтором (ui/index.html).
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Mutex;

use tauri::ipc::CapabilityBuilder;
use tauri::menu::{Menu, MenuItem, PredefinedMenuItem};
use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
#[cfg(target_os = "macos")]
use tauri::RunEvent;
use tauri::webview::DownloadEvent;
use tauri::{AppHandle, Manager, State, UserAttentionType, WebviewUrl, WebviewWindow, WebviewWindowBuilder, WindowEvent, Wry};
use tauri_plugin_deep_link::DeepLinkExt;
use tauri_plugin_notification::NotificationExt;
use tauri_plugin_opener::OpenerExt;
use url::Url;

const PROTOCOL: &str = "shalter";
const MAIN: &str = "main";

struct Shell {
    app_url: String,
    origin: String,
    // Ссылка shalter://, с которой запустили приложение: стартовая страница
    // откроет её вместо главной.
    pending_target: Mutex<Option<String>>,
    tray_open_item: Mutex<Option<MenuItem<Wry>>>,
    quitting: AtomicBool,
}

// 1) SHALTER_APP_URL — dev-режим (npm run desktop:dev → http://localhost:3000)
// 2) server.url из capacitor.config.json — продакшен (https://shalter.ru).
fn app_url() -> String {
    if let Ok(url) = std::env::var("SHALTER_APP_URL") {
        if !url.is_empty() {
            return url;
        }
    }
    serde_json::from_str::<serde_json::Value>(include_str!("../../capacitor.config.json"))
        .ok()
        .and_then(|cfg| cfg["server"]["url"].as_str().map(str::to_owned))
        .unwrap_or_else(|| "https://shalter.ru".into())
}

fn origin_of(url: &str) -> String {
    Url::parse(url).map(|u| u.origin().ascii_serialization()).unwrap_or_default()
}

fn is_app_url(shell: &Shell, url: &Url) -> bool {
    url.origin().ascii_serialization() == shell.origin
}

// Своя стартовая страница из ui/ (tauri://localhost, а на Windows http(s)://tauri.localhost).
fn is_local_url(url: &Url) -> bool {
    url.scheme() == "tauri" || url.host_str() == Some("tauri.localhost")
}

// Те же значения, что process.platform в Electron, — веб-приложение на них не рассчитывает,
// но пусть мост остаётся совместимым.
fn platform() -> &'static str {
    match std::env::consts::OS {
        "windows" => "win32",
        "macos" => "darwin",
        other => other,
    }
}

// Мост window.shalterDesktop — тот же, что давал preload.js в Electron. Только для своего
// сервера: чужие страницы его не получают (и IPC им всё равно не разрешён).
fn bridge_script(origin: &str) -> String {
    format!(
        r#"(function () {{
  var ORIGIN = {origin:?};
  if (location.origin !== ORIGIN || window.shalterDesktop) return;
  var inv = function (cmd, args) {{
    var ipc = window.__TAURI_INTERNALS__;
    return ipc ? ipc.invoke(cmd, args || {{}}).catch(function () {{}}) : Promise.resolve();
  }};
  window.shalterDesktop = {{
    platform: {platform:?},
    setUnread: function (count) {{ return inv("set_unread", {{ count: Math.max(0, Math.floor(Number(count) || 0)) }}); }},
    focus: function () {{ return inv("focus_window"); }},
    notify: function (title, body, url) {{ return inv("notify", {{ title: String(title == null ? "Shalter" : title), body: String(body == null ? "" : body), url: url || null }}); }},
    retry: function (target) {{ return inv("retry", {{ target: target || null }}); }}
  }};
  // Свои ссылки открываем в этом же окне, всё остальное — в браузере по умолчанию.
  var nativeOpen = window.open;
  window.open = function (url) {{
    try {{
      var u = new URL(url, location.href);
      if (u.origin === ORIGIN) {{ location.href = u.href; return null; }}
      inv("open_external", {{ url: u.href }});
      return null;
    }} catch (e) {{
      return nativeOpen.apply(window, arguments);
    }}
  }};
}})();"#,
        origin = origin,
        platform = platform()
    )
}

fn main_window(app: &AppHandle) -> Option<WebviewWindow> {
    app.get_webview_window(MAIN)
}

fn show_window(app: &AppHandle) {
    if let Some(win) = main_window(app) {
        let _ = win.unminimize();
        let _ = win.show();
        let _ = win.set_focus();
    }
}

fn toggle_window(app: &AppHandle) {
    if let Some(win) = main_window(app) {
        let visible = win.is_visible().unwrap_or(false);
        let focused = win.is_focused().unwrap_or(false);
        if visible && focused {
            let _ = win.hide();
        } else {
            show_window(app);
        }
    }
}

fn quit(app: &AppHandle) {
    app.state::<Shell>().quitting.store(true, Ordering::SeqCst);
    app.exit(0);
}

// shalter://chat/abc → https://shalter.ru/chat/abc
fn deep_link_target(shell: &Shell, link: &str) -> Option<String> {
    let u = Url::parse(link).ok()?;
    if u.scheme() != PROTOCOL {
        return None;
    }
    let path = [u.host_str().unwrap_or(""), u.path().trim_start_matches('/')]
        .iter()
        .filter(|p| !p.is_empty())
        .cloned()
        .collect::<Vec<_>>()
        .join("/");
    let query = u.query().map(|q| format!("?{q}")).unwrap_or_default();
    Some(format!("{}/{}{}", shell.origin, path, query))
}

fn open_deep_link(app: &AppHandle, link: &str) {
    let shell = app.state::<Shell>();
    let Some(target) = deep_link_target(&shell, link) else { return };
    show_window(app);
    if let (Some(win), Ok(url)) = (main_window(app), Url::parse(&target)) {
        let _ = win.navigate(url);
    }
}

// ---------- команды моста ----------

#[tauri::command]
fn startup_target(shell: State<Shell>) -> String {
    shell.pending_target.lock().unwrap().take().unwrap_or_else(|| shell.app_url.clone())
}

// Есть ли связь с сервером — проверяем прямым TCP-соединением, а не fetch() со стартовой
// страницы: у части пользователей WebKit отклонял такой запрос (страница на схеме
// tauri://), и приложение висело на «Ожидание сети…» при работающем интернете.
#[tauri::command]
async fn server_reachable(shell: State<'_, Shell>) -> Result<bool, ()> {
    let Ok(url) = Url::parse(&shell.app_url) else { return Ok(false) };
    let Some(host) = url.host_str().map(str::to_owned) else { return Ok(false) };
    let port = url.port_or_known_default().unwrap_or(443);
    Ok(tauri::async_runtime::spawn_blocking(move || {
        use std::net::{TcpStream, ToSocketAddrs};
        use std::time::Duration;
        (host.as_str(), port)
            .to_socket_addrs()
            .map(|addrs| addrs.into_iter().any(|a| TcpStream::connect_timeout(&a, Duration::from_secs(5)).is_ok()))
            .unwrap_or(false)
    })
    .await
    .unwrap_or(false))
}

#[tauri::command]
fn set_unread(app: AppHandle, shell: State<Shell>, count: u32) {
    let label = if count > 0 { format!("Открыть Shalter ({count})") } else { "Открыть Shalter".into() };
    if let Some(item) = shell.tray_open_item.lock().unwrap().as_ref() {
        let _ = item.set_text(label);
    }
    if let Some(tray) = app.tray_by_id(MAIN) {
        let tip = if count > 0 { format!("Shalter — непрочитанных: {count}") } else { "Shalter".into() };
        let _ = tray.set_tooltip(Some(tip));
    }
    if let Some(win) = main_window(&app) {
        // macOS Dock и Linux (Unity/KDE); на Windows не поддерживается — там мигание ниже.
        let _ = win.set_badge_count(if count > 0 { Some(count as i64) } else { None });
        if count > 0 && !win.is_focused().unwrap_or(true) {
            let _ = win.request_user_attention(Some(UserAttentionType::Informational));
        }
    }
}

#[tauri::command]
fn focus_window(app: AppHandle) {
    show_window(&app);
}

// Нажатие на системное уведомление на десктопе Tauri не сообщает — url не используется;
// уведомления из самой страницы (Notification API) идут через плагин тем же путём.
#[tauri::command]
fn notify(app: AppHandle, title: String, body: String, url: Option<String>) {
    let _ = url;
    let _ = app.notification().builder().title(title).body(body).show();
}

#[tauri::command]
fn retry(app: AppHandle, shell: State<Shell>, target: Option<String>) {
    let target = target
        .filter(|t| Url::parse(t).map(|u| is_app_url(&shell, &u)).unwrap_or(false))
        .unwrap_or_else(|| shell.app_url.clone());
    if let (Some(win), Ok(url)) = (main_window(&app), Url::parse(&target)) {
        let _ = win.navigate(url);
    }
}

#[tauri::command]
fn open_external(app: AppHandle, url: String) {
    if let Ok(u) = Url::parse(&url) {
        if matches!(u.scheme(), "http" | "https" | "mailto" | "tg") {
            let _ = app.opener().open_url(u.as_str(), None::<&str>);
        }
    }
}

// ---------- окно и трей ----------

fn create_window(app: &AppHandle) -> tauri::Result<WebviewWindow> {
    let shell = app.state::<Shell>();
    let nav_app = app.clone();
    WebviewWindowBuilder::new(app, MAIN, WebviewUrl::App("index.html".into()))
        .title("Shalter")
        .inner_size(1280.0, 840.0)
        .min_inner_size(380.0, 480.0)
        .background_color(tauri::window::Color(0xf5, 0xf6, 0xf9, 0xff))
        .initialization_script(&bridge_script(&shell.origin))
        // Скачивания: в «Загрузки», не затирая файл с тем же именем, и уведомление по
        // окончании. Без этого обработчика скачивание из окна молча не происходило.
        .on_download(move |webview, event| {
            match event {
                DownloadEvent::Requested { url, destination } => {
                    let name = destination
                        .file_name()
                        .map(|n| n.to_string_lossy().into_owned())
                        .filter(|n| !n.is_empty())
                        .or_else(|| url.path_segments().and_then(|mut s| s.next_back()).map(str::to_owned))
                        .filter(|n| !n.is_empty())
                        .unwrap_or_else(|| "file".into());
                    if let Ok(dir) = webview.app_handle().path().download_dir() {
                        *destination = unique_path(&dir, &name);
                    }
                }
                DownloadEvent::Finished { path, success, .. } => {
                    let body = match (success, path) {
                        (true, Some(p)) => format!("Сохранено: {}", p.display()),
                        (true, None) => "Файл сохранён в «Загрузки»".into(),
                        (false, _) => "Не удалось скачать файл".into(),
                    };
                    let _ = webview.app_handle().notification().builder().title("Shalter").body(body).show();
                }
                _ => {}
            }
            true
        })
        // Свои страницы — в окне, всё остальное — в браузере по умолчанию.
        .on_navigation(move |url| {
            let shell = nav_app.state::<Shell>();
            if is_local_url(url) || is_app_url(&shell, url) || matches!(url.scheme(), "about" | "data" | "blob") {
                return true;
            }
            if matches!(url.scheme(), "http" | "https" | "mailto" | "tg") {
                let _ = nav_app.opener().open_url(url.as_str(), None::<&str>);
            }
            false
        })
        .build()
}

// «фото.jpg» → «фото (2).jpg», если такой файл уже есть.
fn unique_path(dir: &std::path::Path, name: &str) -> std::path::PathBuf {
    let candidate = dir.join(name);
    if !candidate.exists() {
        return candidate;
    }
    let path = std::path::Path::new(name);
    let stem = path.file_stem().map(|s| s.to_string_lossy().into_owned()).unwrap_or_else(|| name.to_owned());
    let ext = path.extension().map(|e| format!(".{}", e.to_string_lossy())).unwrap_or_default();
    (2..1000)
        .map(|i| dir.join(format!("{stem} ({i}){ext}")))
        .find(|p| !p.exists())
        .unwrap_or(candidate)
}

fn create_tray(app: &AppHandle) -> tauri::Result<()> {
    let open = MenuItem::with_id(app, "open", "Открыть Shalter", true, None::<&str>)?;
    let quit_item = MenuItem::with_id(app, "quit", "Выйти", true, None::<&str>)?;
    let menu = Menu::with_items(app, &[&open, &PredefinedMenuItem::separator(app)?, &quit_item])?;
    *app.state::<Shell>().tray_open_item.lock().unwrap() = Some(open);

    let mut tray = TrayIconBuilder::with_id(MAIN)
        .tooltip("Shalter")
        .menu(&menu)
        .show_menu_on_left_click(false)
        .on_menu_event(|app, event| match event.id.as_ref() {
            "open" => show_window(app),
            "quit" => quit(app),
            _ => {}
        })
        .on_tray_icon_event(|tray, event| {
            if let TrayIconEvent::Click { button: MouseButton::Left, button_state: MouseButtonState::Up, .. } = event {
                toggle_window(tray.app_handle());
            }
        });
    if let Some(icon) = app.default_window_icon() {
        tray = tray.icon(icon.clone());
    }
    tray.build(app)?;
    Ok(())
}

#[cfg(target_os = "linux")]
fn only_nvidia_gpus() -> bool {
    let vendors: Vec<String> = std::fs::read_dir("/sys/class/drm")
        .map(|dir| {
            dir.flatten()
                .filter_map(|e| std::fs::read_to_string(e.path().join("device/vendor")).ok())
                .map(|v| v.trim().to_lowercase())
                .collect()
        })
        .unwrap_or_default();
    !vendors.is_empty() && vendors.iter().all(|v| v == "0x10de")
}

fn main() {
    // WebKitGTK с аппаратным dmabuf-рендером на проприетарном драйвере NVIDIA показывает
    // белое окно. Выключаем его только там, где все видеокарты — NVIDIA: на остальных
    // (в том числе ноутбуках Intel + NVIDIA, где экран рисует Intel) отключение лишь
    // замедляет отрисовку и прокрутку.
    #[cfg(target_os = "linux")]
    if std::env::var_os("WEBKIT_DISABLE_DMABUF_RENDERER").is_none() && only_nvidia_gpus() {
        std::env::set_var("WEBKIT_DISABLE_DMABUF_RENDERER", "1");
    }

    let app_url = app_url();
    let origin = origin_of(&app_url);

    let app = tauri::Builder::default()
        // Должен быть первым: второй запуск (в том числе по ссылке shalter://) только
        // поднимает уже открытое окно, а ссылку передаёт плагину deep-link.
        .plugin(tauri_plugin_single_instance::init(|app, _argv, _cwd| show_window(app)))
        .plugin(tauri_plugin_deep_link::init())
        .plugin(tauri_plugin_window_state::Builder::default().build())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_opener::init())
        .manage(Shell {
            app_url,
            origin: origin.clone(),
            pending_target: Mutex::new(None),
            tray_open_item: Mutex::new(None),
            quitting: AtomicBool::new(false),
        })
        .invoke_handler(tauri::generate_handler![startup_target, server_reachable, set_unread, focus_window, notify, retry, open_external])
        .setup(move |app| {
            let handle = app.handle().clone();

            // IPC для страниц своего сервера: только команды моста и уведомления.
            app.add_capability(
                CapabilityBuilder::new("remote-app")
                    .remote(format!("{origin}/*"))
                    .window(MAIN)
                    .permission("allow-set-unread")
                    .permission("allow-focus-window")
                    .permission("allow-notify")
                    .permission("allow-retry")
                    .permission("allow-open-external")
                    .permission("notification:default"),
            )?;

            // Ссылки shalter://: AppImage и dev-сборка сами в системе не регистрируются.
            #[cfg(any(target_os = "linux", target_os = "windows"))]
            let _ = app.deep_link().register_all();
            if let Ok(Some(urls)) = app.deep_link().get_current() {
                let shell = app.state::<Shell>();
                if let Some(target) = urls.iter().find_map(|u| deep_link_target(&shell, u.as_str())) {
                    *shell.pending_target.lock().unwrap() = Some(target);
                }
            }
            let link_app = handle.clone();
            app.deep_link().on_open_url(move |event| {
                if let Some(url) = event.urls().first() {
                    open_deep_link(&link_app, url.as_str());
                }
            });

            create_window(&handle)?;
            // Трей не обязателен: без поддержки в окружении (часть Linux-сред) просто живём без него.
            if let Err(err) = create_tray(&handle) {
                eprintln!("tray unavailable: {err}");
            }
            Ok(())
        })
        // Закрытие окна сворачивает в трей (как Telegram Desktop); выход — из меню трея.
        .on_window_event(|window, event| {
            if let WindowEvent::CloseRequested { api, .. } = event {
                let app = window.app_handle();
                let has_tray = app.tray_by_id(MAIN).is_some() || cfg!(target_os = "macos");
                if !app.state::<Shell>().quitting.load(Ordering::SeqCst) && has_tray {
                    api.prevent_close();
                    let _ = window.hide();
                }
            }
        })
        .build(tauri::generate_context!())
        .expect("не удалось запустить Shalter");

    app.run(|_app, _event| {
        // macOS: нажатие на иконку в Dock возвращает скрытое окно.
        #[cfg(target_os = "macos")]
        if let RunEvent::Reopen { .. } = _event {
            show_window(_app);
        }
    });
}
