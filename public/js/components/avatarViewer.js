import { askConfirm } from "./confirmDialog.js";
import { el, clear, appendAll } from "../lib/dom.js";
import { iconSvg } from "../icons.js";
import { api } from "../api.js";
import { getState, setState, updateSelf } from "../state.js";
import { uploadFile } from "../lib/upload.js";
import { fileToAvatarDataUrl, videoPosterDataUrl } from "../lib/image.js";
import { startRecording, isRecordingSupported } from "../lib/recorder.js";

const MAX_VIDEO_SECONDS = 180;

export function openAvatarViewer(user, { canEdit = false, onChange } = {}) {
  let avatars = [...(user.avatarImages ?? [])];
  if (!avatars.length && user.avatarImage) avatars = [{ url: user.avatarImage, kind: "image", poster: user.avatarImage }];
  let index = 0;
  let busy = null;
  let error = null;
  let recording = null;
  let recordSec = 0;

  const overlay = el("div", { class: "avatar-viewer-overlay", onclick: (e) => e.target === overlay && close() });
  const stage = el("div", { class: "avatar-viewer-stage" });
  const dots = el("div", { class: "avatar-viewer-dots" });
  const bar = el("div", { class: "avatar-viewer-bar" });
  const errorSlot = el("p", { class: "avatar-viewer-error" });

  const fileInput = el("input", {
    type: "file",
    accept: "image/*,video/*",
    class: "hidden-input",
    onchange: (e) => {
      const file = e.target.files?.[0];
      e.target.value = "";
      if (file) add(file);
    },
  });

  appendAll(overlay,
    el("div", { class: "avatar-viewer" }, [
      el("div", { class: "avatar-viewer-head" }, [
        el("span", { class: "avatar-viewer-name" }, user.name ?? ""),
        el("button", { class: "icon-btn", title: "Закрыть", html: iconSvg("X", 20), onclick: () => close() }),
      ]),
      stage,
      dots,
      errorSlot,
      bar,
      fileInput,
    ])
  );
  document.body.appendChild(overlay);

  function close() {
    document.removeEventListener("keydown", onKey);
    recording?.cancel();
    recording = null;
    overlay.remove();
  }
  function onKey(e) {
    if (e.key === "Escape") close();
    if (e.key === "ArrowRight") go(1);
    if (e.key === "ArrowLeft") go(-1);
  }
  document.addEventListener("keydown", onKey);

  function go(delta) {
    if (avatars.length < 2) return;
    index = (index + delta + avatars.length) % avatars.length;
    render();
  }

  let touchX = null;
  let touchY = null;
  stage.addEventListener("touchstart", (e) => {
    touchX = e.touches[0].clientX;
    touchY = e.touches[0].clientY;
  }, { passive: true });
  stage.addEventListener("touchend", (e) => {
    if (touchX == null) return;
    const dx = e.changedTouches[0].clientX - touchX;
    const dy = e.changedTouches[0].clientY - touchY;
    if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy)) go(dx < 0 ? 1 : -1);
    touchX = null;
  });

  async function add(file) {
    error = null;
    const isVideo = file.type.startsWith("video/");
    busy = "Загружаем…";
    render();
    try {
      const poster = isVideo ? await videoPosterDataUrl(file) : await fileToAvatarDataUrl(file);
      if (isVideo) {
        const seconds = await durationOf(file);
        if (Number.isFinite(seconds) && seconds > MAX_VIDEO_SECONDS) {
          throw new Error(`Видео-аватар — не длиннее ${MAX_VIDEO_SECONDS} секунд (у этого ${Math.round(seconds)})`);
        }
      }
      const uploaded = await uploadFile(file, isVideo ? "avatar-video" : "avatar", (p) => {
        busy = `Загружаем… ${Math.round(p * 100)}%`;
        renderBar();
      });
      const res = await api.addAvatar({ url: uploaded.url, kind: isVideo ? "video" : "image", poster });
      avatars = res.avatars;
      index = 0;
      applyUser(res.user);
    } catch (err) {
      error = err.message || "Не удалось загрузить";
    } finally {
      busy = null;
      render();
    }
  }

  async function startVideo() {
    error = null;
    recordSec = 0;
    try {
      recording = await startRecording("avatar-video", {
        onTick: (sec) => {
          recordSec = sec;
          renderBar();
        },
      });
    } catch {
      error = "Не удалось включить камеру";
    }
    render();
  }

  async function stopVideo(keep) {
    const handle = recording;
    if (!handle) return;
    recording = null;
    if (!keep) {
      handle.cancel();
      render();
      return;
    }
    handle.stop();
    const res = await handle.result;
    render();
    if (!res?.blob) return;
    const type = res.mimeType || "video/webm";
    const ext = type.includes("mp4") ? "mp4" : "webm";
    add(new File([res.blob], `avatar-${Date.now()}.${ext}`, { type }));
  }

  function durationOf(file) {
    return new Promise((resolve) => {
      const url = URL.createObjectURL(file);
      const v = document.createElement("video");
      v.preload = "metadata";
      v.onloadedmetadata = () => {
        URL.revokeObjectURL(url);
        resolve(v.duration || 0);
      };
      v.onerror = () => resolve(0);
      v.src = url;
    });
  }

  function applyUser(updated) {
    if (getState().user?.id === updated.id) updateSelf(updated);
    onChange?.(updated);
  }

  async function act(fn, label) {
    busy = label;
    error = null;
    render();
    try {
      const res = await fn();
      avatars = res.avatars;
      if (index >= avatars.length) index = Math.max(0, avatars.length - 1);
      applyUser(res.user);
    } catch (err) {
      error = err.message || "Не удалось";
    } finally {
      busy = null;
      render();
    }
  }

  function renderStage() {
    clear(stage);
    if (recording) {
      const preview = el("video", { class: "avatar-viewer-media recording", autoplay: true, muted: true, playsInline: true });
      preview.srcObject = recording.stream;
      stage.appendChild(preview);
      return;
    }
    const current = avatars[index];
    if (!current) {
      stage.appendChild(el("p", { class: "avatar-viewer-empty" }, canEdit ? "Фото профиля пока нет" : "Нет фото профиля"));
      return;
    }
    stage.appendChild(
      current.kind === "video"
        ? el("video", {
            class: "avatar-viewer-media",
            src: current.url,
            poster: current.poster,
            autoplay: true,
            loop: true,
            muted: true,
            playsInline: true,
            controls: true,
          })
        : el("img", { class: "avatar-viewer-media", src: current.url, alt: user.name ?? "" })
    );
    if (avatars.length > 1) {
      appendAll(stage,
        el("button", { class: "avatar-viewer-nav prev", html: iconSvg("ChevronLeft", 26), onclick: () => go(-1) }),
        el("button", { class: "avatar-viewer-nav next", html: iconSvg("ChevronRight", 26), onclick: () => go(1) })
      );
    }
  }

  function renderBar() {
    clear(bar);
    if (recording) {
      const mm = String(Math.floor(recordSec / 60)).padStart(2, "0");
      const ss = String(recordSec % 60).padStart(2, "0");
      appendAll(bar,
        el("p", { class: "avatar-viewer-busy" }, `Запись… ${mm}:${ss}`),
        el("button", { class: "btn-accent", onclick: () => stopVideo(true) }, "Готово"),
        el("button", { class: "profile-action-btn", onclick: () => stopVideo(false) }, "Отмена")
      );
      return;
    }
    if (busy) {
      bar.appendChild(el("p", { class: "avatar-viewer-busy" }, busy));
      return;
    }
    if (!canEdit) return;
    appendAll(bar,
      ...[
        el("button", { class: "btn-accent", onclick: () => fileInput.click() }, "Добавить фото или видео"),
        isRecordingSupported() ? el("button", { class: "profile-action-btn", onclick: () => startVideo() }, "Записать видео") : null,
        avatars.length > 1 && index !== 0
          ? el("button", { class: "profile-action-btn", onclick: () => act(() => api.setMainAvatar(index), "Сохраняем…") }, "Сделать основной")
          : null,
        avatars.length
          ? el(
              "button",
              {
                class: "profile-action-btn danger",
                onclick: async () => {
                  if ((await askConfirm("Удалить эту аватарку?"))) act(() => api.removeAvatar(index), "Удаляем…");
                },
              },
              "Удалить"
            )
          : null,
      ].filter(Boolean)
    );
  }

  function render() {
    renderStage();
    clear(dots);
    if (avatars.length > 1) {
      appendAll(dots,
        ...avatars.map((_, i) =>
          el("button", {
            class: `avatar-viewer-dot ${i === index ? "active" : ""}`,
            title: `${i + 1} из ${avatars.length}`,
            onclick: () => {
              index = i;
              render();
            },
          })
        )
      );
    }
    errorSlot.textContent = error ?? "";
    errorSlot.hidden = !error;
    renderBar();
  }

  render();
  return close;
}
