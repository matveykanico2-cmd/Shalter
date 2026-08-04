import { el, mount, clear } from "../lib/dom.js";
import { iconSvg } from "../icons.js";
import { Avatar } from "../components/avatar.js";
import { api } from "../api.js";
import { LoginView } from "./login.js";

// The page a *real* phone camera lands on after scanning the QR code shown
// on the waiting device's /login screen (see login.js's qrCodeSvg — it
// encodes a plain https:// URL to here, not a custom scheme, so any camera
// app can open it with no Shalter-specific scanner needed). Whoever opens
// this link just needs to be logged in *somewhere* to vouch for the other
// device — if they aren't yet, they log in right here first.
export async function QrLoginConfirmView(root) {
  const token = new URLSearchParams(window.location.search).get("token");

  // Built once — the page-chrome entrance animations (logo, brand, card)
  // should only ever play on the initial mount, not replay every time the
  // confirm step below changes state (pending → done). Only contentSlot's
  // contents get swapped after this.
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

  if (!token) {
    setContent(
      el("p", { class: "login-error center" }, "Ссылка неполная или повреждена — токен не найден."),
      el("a", { href: "/login", class: "login-link" }, "Перейти ко входу")
    );
    return;
  }

  function renderConfirmStep(user) {
    let pending = false;
    let done = false;
    let error = null;

    function render() {
      if (done) {
        setContent(
          el("p", { class: "qr-login-title" }, "Готово ✓"),
          el("p", { class: "qr-login-instructions" }, "Вход подтверждён — вернитесь к другому устройству, оно уже открыло Shalter.")
        );
        return;
      }
      setContent(
        el("p", { class: "qr-login-title" }, "Подтвердить вход в Shalter?"),
        el("div", { class: "qr-confirm-account" }, [
          Avatar({ name: user.name, color: user.avatarColor, image: user.avatarImage, size: 56 }),
          el("div", {}, [
            el("p", { class: "qr-confirm-name" }, user.name || "Без имени"),
            el("p", { class: "qr-confirm-sub" }, user.phone || user.email),
          ]),
        ]),
        el("p", { class: "qr-login-instructions" }, "Этот код запросило другое устройство. Подтверждайте, только если вход инициировали вы сами."),
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
                await api.confirmQrLogin(token);
                done = true;
              } catch (err) {
                error = err.message;
              } finally {
                pending = false;
                render();
              }
            },
          },
          pending ? "Подтверждаем…" : "Подтвердить вход"
        ),
        el("a", { href: "/", class: "login-link" }, "Отмена")
      );
    }
    render();
  }

  const { user } = await api.session();
  if (user) {
    renderConfirmStep(user);
  } else {
    setContent(
      el("p", { class: "qr-login-instructions center" }, "Чтобы подтвердить вход на другом устройстве, сначала войдите в свой аккаунт."),
      el("div", { class: "qr-login-embedded-form" })
    );
    // Re-uses the exact same login form as the main /login page — once it
    // succeeds here, move straight to the confirm step instead of
    // navigating away (see LoginView's onSuccess option).
    LoginView(contentSlot.querySelector(".qr-login-embedded-form"), {
      embedded: true,
      onSuccess: (loggedInUser) => renderConfirmStep(loggedInUser),
    });
  }
}
