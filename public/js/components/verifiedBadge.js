import { el } from "../lib/dom.js";
import { iconSvg } from "../icons.js";

export function VerifiedBadge(subject, size = 14) {
  if (!subject?.isVerified) return null;
  return el("span", {
    class: "verified-badge",
    title: "Аккаунт подтверждён администрацией Shalter",
    html: iconSvg("Verified", size),
  });
}
