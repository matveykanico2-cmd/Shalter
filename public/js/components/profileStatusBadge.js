import { el } from "../lib/dom.js";
import { openStatusViewer } from "./statusViewer.js";

// The status icon next to a name (Settings → Профиль → Статус). Same shape as
// VerifiedBadge next to it: returns null when the subject has none equipped,
// so a call site can drop it straight into an el() child list without an
// extra `&&` at every one of the eight places a name is drawn.
//
// Clickable, like an avatar: tapping it opens the icon full-size
// (statusViewer.js) instead of leaving a person's chosen picture forever
// stuck at 16px with no way to actually look at it.
export function ProfileStatusBadge(subject, size = 16) {
  if (!subject?.statusIcon) return null;
  // A <span>, not a <button>: this badge sits inside an already-clickable row
  // in several places (a chat-list row is itself a <button>), and a button
  // nested in a button is invalid markup with unreliable click behaviour.
  return el(
    "span",
    {
      class: "profile-status-badge-btn",
      role: "button",
      tabindex: "0",
      title: subject.statusName || "Статус",
      onclick: (e) => {
        e.stopPropagation();
        openStatusViewer(subject);
      },
      onkeydown: (e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          e.stopPropagation();
          openStatusViewer(subject);
        }
      },
    },
    [
      el("img", {
        class: "profile-status-badge",
        src: subject.statusIcon,
        alt: "",
        style: { width: `${size}px`, height: `${size}px` },
      }),
    ]
  );
}
