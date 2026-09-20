import { el, mount, clear } from "../lib/dom.js";
import { iconSvg } from "../icons.js";
import { Avatar } from "../components/avatar.js";
import { api } from "../api.js";
import { LoginView } from "./login.js";

// Where a third-party site sends the browser to let someone sign in with
// their Shalter account ("Войти через Shalter") — a plain OAuth
// authorization-code consent screen. Same standalone-page shape as
// qrLoginConfirm.js (outside the authenticated app shell, embeds LoginView
// right here if not logged in yet) for the same reason: the query string
// (client_id/redirect_uri/state) has to survive a login that happens on
// this exact page, not a redirect to /login and back that would drop it.
export async function OAuthAuthorizeView(root) {
  const params = new URLSearchParams(window.location.search);
  const clientId = params.get("client_id");
  const redirectUri = params.get("redirect_uri");
  const state = params.get("state");

  const contentSlot = el("div");
  mount(
    root,
    el("div", { class: "login-page" }, [
      el("div", { class: "login-bg" }, [
        el("span", { class: "login-orb login-orb-1" }),
        el("span", { class: "login-orb login-orb-2" }),
        el("span", { class: "login-orb login-orb-3" }),
      ]),
      el("div", { class: "login-box" }, [
        el("div", { class: "login-header" }, [
          el("div", { class: "login-logo" }, [el("span", { html: iconSvg("Send", 26) })]),
          el("h1", { class: "login-brand" }, "Shalter"),
        ]),
        el("div", { class: "login-card" }, contentSlot),
      ]),
    ])
  );

  function setContent(...children) {
    clear(contentSlot);
    children.forEach((c) => c != null && contentSlot.appendChild(c));
  }

  if (!clientId || !redirectUri) {
    setContent(
      el("p", { class: "login-error center" }, "Ссылка неполная — не хватает client_id или redirect_uri."),
      el("a", { href: "/", class: "login-link" }, "На главную")
    );
    return;
  }

  let appInfo = null;
  try {
    appInfo = await api.getOAuthAppInfo(clientId, redirectUri);
  } catch (err) {
    setContent(
      el("p", { class: "login-error center" }, err.message || "Приложение не найдено"),
      el("a", { href: "/", class: "login-link" }, "На главную")
    );
    return;
  }

  function renderConsent(user) {
    let pending = false;
    let error = null;

    function render() {
      setContent(
        el("p", { class: "qr-login-title" }, `«${appInfo.name}» хочет войти через Shalter`),
        el("div", { class: "qr-confirm-account" }, [
          Avatar({ name: user.name, color: user.avatarColor, image: user.avatarImage, size: 56 }),
          el("div", {}, [
            el("p", { class: "qr-confirm-name" }, user.name || "Без имени"),
            el("p", { class: "qr-confirm-sub" }, user.username ? `@${user.username}` : ""),
          ]),
        ]),
        el(
          "p",
          { class: "qr-login-instructions" },
          "Приложение получит только имя, юзернейм и фото профиля — ничего больше (ни переписку, ни телефон, ни звёзды)."
        ),
        error ? el("p", { class: "login-error center" }, error) : null,
        el(
          "button",
          {
            class: "login-submit",
            disabled: pending,
            onclick: async () => {
              pending = true;
              error = null;
              render();
              try {
                const { redirectUrl } = await api.approveOAuth(clientId, redirectUri, state);
                window.location.href = redirectUrl;
              } catch (err) {
                error = err.message || "Не удалось подтвердить вход";
                pending = false;
                render();
              }
            },
          },
          pending ? "Входим…" : "Разрешить"
        ),
        el("a", { href: "/", class: "login-link" }, "Отмена")
      );
    }
    render();
  }

  const { user } = await api.session();
  if (user) {
    renderConsent(user);
  } else {
    setContent(
      el("p", { class: "qr-login-instructions center" }, `Чтобы войти в «${appInfo.name}» через Shalter, сначала войдите в свой аккаунт.`),
      el("div", { class: "qr-login-embedded-form" })
    );
    LoginView(contentSlot.querySelector(".qr-login-embedded-form"), {
      embedded: true,
      onSuccess: (loggedInUser) => renderConsent(loggedInUser),
    });
  }
}
