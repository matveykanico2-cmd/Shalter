import { el, mount } from "../lib/dom.js";
import { iconSvg } from "../icons.js";
import { api } from "../api.js";
import { Avatar } from "../components/avatar.js";
import { navigate } from "../router.js";

// «Люди рядом» — сознательно неточно (см. server/data/nearby.js): координаты
// огрубляются на сервере, другим виден только диапазон расстояния, а не
// метры, присутствие само гаснет через получаса без обновления. Здесь, на
// клиенте, ничего этого не подделать точнее — сервер и так огрубит.
export async function NearbyView(root) {
  let phase = "intro"; // intro -> sharing -> error
  let users = [];
  let error = null;
  let watchId = null;

  function stop() {
    if (watchId != null) navigator.geolocation.clearWatch(watchId);
    watchId = null;
  }

  async function stopSharing() {
    stop();
    await api.stopNearbySharing().catch(() => {});
    phase = "intro";
    users = [];
    render();
  }

  async function startSharing() {
    if (!navigator.geolocation) {
      error = "Геолокация не поддерживается в этом браузере";
      render();
      return;
    }
    phase = "sharing";
    error = null;
    render();

    const update = (pos) => {
      api
        .shareNearbyLocation(pos.coords.latitude, pos.coords.longitude)
        .then((res) => {
          users = res.users;
          render();
        })
        .catch((err) => {
          error = err.message || "Не удалось обновить местоположение";
          render();
        });
    };
    // Первое обновление сразу, дальше — редко: список не гонка, точность и
    // так огрублена сервером до километра, часто дёргать смысла нет.
    navigator.geolocation.getCurrentPosition(update, () => {
      error = "Не удалось получить местоположение";
      phase = "intro";
      render();
    });
    watchId = navigator.geolocation.watchPosition(update, () => {}, { maximumAge: 5 * 60_000, timeout: 20_000 });
  }

  function render() {
    mount(
      root,
      el("div", { class: "join-invite" }, [
        el("div", { class: "settings-header" }, [
          el("button", { class: "settings-header-back", html: iconSvg("ChevronLeft", 22), onclick: () => navigate("/contacts") }),
          el("h2", { class: "settings-header-title" }, "Люди рядом"),
        ]),
        el(
          "p",
          { class: "settings-toggle-hint" },
          "Координаты огрубляются до примерно километра, а остальным видно только расстояние диапазоном — не точка на карте."
        ),
        error ? el("p", { class: "login-error" }, error) : null,
        phase === "intro"
          ? el("button", { class: "btn-accent", onclick: startSharing }, "Показать, кто рядом")
          : el("button", { class: "btn-secondary", onclick: stopSharing }, "Перестать показывать меня"),
        phase === "sharing"
          ? users.length
            ? el(
                "div",
                { class: "settings-devices-list" },
                users.map((u) =>
                  el("div", { class: "settings-device-row" }, [
                    Avatar({ name: u.name, color: u.avatarColor, image: u.avatarImage, size: 40 }),
                    el("div", { class: "settings-device-body" }, [
                      el("p", {}, u.name),
                      el("p", { class: "settings-toggle-hint" }, u.label),
                    ]),
                  ])
                )
              )
            : el("p", { class: "empty-hint" }, "Пока рядом никого не видно")
          : null,
      ])
    );
  }

  render();
  root._cleanup = stop;
}
