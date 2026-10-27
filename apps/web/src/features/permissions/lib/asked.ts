// Окно разрешений показываем при первом запуске один раз (на этом устройстве).
const SEEN_KEY = "shalter.permissionsAsked";

export function permissionsAlreadyAsked() {
  try {
    return localStorage.getItem(SEEN_KEY) === "1";
  } catch {
    return false;
  }
}

export function markPermissionsAsked() {
  try {
    localStorage.setItem(SEEN_KEY, "1");
  } catch {
    // Хранилище недоступно — спросим снова при следующем запуске.
  }
}
