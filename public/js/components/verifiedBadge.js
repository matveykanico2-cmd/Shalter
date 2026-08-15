import { el } from "../lib/dom.js";
import { iconSvg } from "../icons.js";

// The verified check next to a name. One helper rather than the mark being
// re-inlined at each of the eight places a name is drawn — that's how the
// premium crown ended up with three slightly different sizes.
//
// Returns null when the subject isn't verified, so call sites can drop it
// straight into an el() child list.
export function VerifiedBadge(subject, size = 14) {
  if (!subject?.isVerified) return null;
  return el("span", {
    class: "verified-badge",
    title: "Аккаунт подтверждён администрацией Shalter",
    html: iconSvg("Verified", size),
  });
}
