import { el } from "../lib/dom.js";
import { openStatusViewer } from "./statusViewer.js";

export function ProfileStatusBadge(subject, size = 16) {
  if (!subject?.statusIcon) return null;
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
