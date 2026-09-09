import { el } from "../lib/dom.js";

// The status icon next to a name (Settings → Профиль → Статус). Same shape as
// VerifiedBadge next to it: returns null when the subject has none equipped,
// so a call site can drop it straight into an el() child list without an
// extra `&&` at every one of the eight places a name is drawn.
export function ProfileStatusBadge(subject, size = 16) {
  if (!subject?.statusIcon) return null;
  return el("img", {
    class: "profile-status-badge",
    src: subject.statusIcon,
    alt: "",
    title: "Статус",
    style: { width: `${size}px`, height: `${size}px` },
  });
}
