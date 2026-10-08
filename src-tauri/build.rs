fn main() {
    // Команды моста window.shalterDesktop. Объявляем их явно: тогда у каждой есть своё
    // разрешение (allow-set-unread …), и странице сервера выдаются только они.
    tauri_build::try_build(tauri_build::Attributes::new().app_manifest(tauri_build::AppManifest::new().commands(&[
        "startup_target",
        "set_unread",
        "focus_window",
        "notify",
        "retry",
        "open_external",
    ])))
    .expect("failed to run tauri-build");
}
