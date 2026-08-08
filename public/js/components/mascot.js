import { el } from "../lib/dom.js";

// A friendly little bear that jumps in and waves once on mount — the same
// "cute animated mascot on an empty state" touch Telegram Desktop's own
// "select a chat" screen has. Built as a raw SVG string (like icons.js's
// iconSvg()) rather than nested el() calls: el()'s document.createElement
// has no SVG-namespace awareness, so <circle>/<ellipse>/<path> built that
// way silently fail to render — innerHTML parsing handles foreign-content
// (SVG-in-HTML) correctly, el()'s tree-building doesn't.
// One-shot animation (see .bear-jump/.bear-arm-wave in components.css):
// this only ever mounts on a real navigation to "/" (see app.js's
// route("/")), not inside a polling re-render loop, so there's no need for
// the seenEntranceIds replay guard messageBubble.js's stickers use.
const BEAR_SVG = `
<svg class="mascot-bear" viewBox="0 0 120 128" width="120" height="128">
  <ellipse class="bear-shadow" cx="60" cy="116" rx="26" ry="6" fill="currentColor" opacity="0.12"/>
  <g class="bear-jump">
    <ellipse cx="60" cy="84" rx="29" ry="25" fill="#a9714a"/>
    <ellipse cx="33" cy="84" rx="8" ry="13" fill="#a9714a"/>
    <g class="bear-arm-wave" style="transform-origin: 87px 76px">
      <ellipse cx="87" cy="84" rx="8" ry="13" fill="#a9714a"/>
    </g>
    <circle cx="60" cy="46" r="25" fill="#c48a5c"/>
    <circle cx="41" cy="25" r="9" fill="#c48a5c"/>
    <circle cx="79" cy="25" r="9" fill="#c48a5c"/>
    <circle cx="41" cy="25" r="4.3" fill="#8a5c38"/>
    <circle cx="79" cy="25" r="4.3" fill="#8a5c38"/>
    <ellipse cx="60" cy="53" rx="12" ry="9" fill="#f0d9bd"/>
    <ellipse cx="60" cy="55" rx="2.8" ry="2.1" fill="#3a2416"/>
    <circle cx="51" cy="42" r="2.8" fill="#2b1a10"/>
    <circle cx="69" cy="42" r="2.8" fill="#2b1a10"/>
    <path d="M52 58 Q60 63 68 58" stroke="#3a2416" stroke-width="2" fill="none" stroke-linecap="round"/>
  </g>
</svg>`;

export function WaveBearMascot() {
  return el("div", { class: "mascot-bear-wrap", html: BEAR_SVG });
}
