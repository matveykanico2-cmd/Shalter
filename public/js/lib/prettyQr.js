import qrcode from "./qrcode.js";

// QR-код в стиле tweb (helpers/qrCode/paintQrCode → qr-code-styling): точки
// со скруглёнными углами там, где нет соседей, угловые «глазки» — скруглённые
// кольца, в центре — знак Shalter. SVG, поэтому чёткий на любом экране.

const LOGO = `<circle cx="256" cy="256" r="256" fill="#3d6df0"/><path fill="#fff" d="M65 186L397 131L357 333L77 336Z"/><path fill="#a9c4fb" d="M397 131L250 235L357 333Z"/><path fill="#d3e0fd" d="M134 336L214 340L138 437Z"/>`;

/**
 * @param {string} text
 * @param {{ color?: string, background?: string, logo?: boolean, margin?: number }} opts
 * @returns {string} SVG
 */
export function prettyQrSvg(text, { color = "#000", background = "transparent", logo = true, margin = 1 } = {}) {
  // С логотипом в центре нужен запас на коррекцию ошибок.
  const qr = qrcode(0, logo ? "Q" : "M");
  qr.addData(text);
  qr.make();
  const n = qr.getModuleCount();
  const size = n + margin * 2;

  // Клетки под логотип оставляем пустыми (≈ 22% стороны, нечётное число модулей).
  let hole = 0;
  if (logo) {
    hole = Math.round(n * 0.22);
    if (hole % 2 === 0) hole += 1;
  }
  const holeStart = Math.floor((n - hole) / 2);
  const inHole = (r, c) => logo && r >= holeStart - 1 && r < holeStart + hole + 1 && c >= holeStart - 1 && c < holeStart + hole + 1;
  const inEye = (r, c) => (r < 7 && c < 7) || (r < 7 && c >= n - 7) || (r >= n - 7 && c < 7);
  const dark = (r, c) => r >= 0 && c >= 0 && r < n && c < n && qr.isDark(r, c) && !inEye(r, c) && !inHole(r, c);

  const R = 0.5;
  let d = "";
  for (let r = 0; r < n; r += 1) {
    for (let c = 0; c < n; c += 1) {
      if (!dark(r, c)) continue;
      const x = c + margin;
      const y = r + margin;
      const up = dark(r - 1, c);
      const down = dark(r + 1, c);
      const left = dark(r, c - 1);
      const right = dark(r, c + 1);
      // Угол скругляется, если с обеих его сторон пусто (как type: "rounded").
      const tl = !up && !left ? R : 0;
      const tr = !up && !right ? R : 0;
      const br = !down && !right ? R : 0;
      const bl = !down && !left ? R : 0;
      d +=
        `M${x + tl} ${y}H${x + 1 - tr}` +
        (tr ? `A${tr} ${tr} 0 0 1 ${x + 1} ${y + tr}` : "") +
        `V${y + 1 - br}` +
        (br ? `A${br} ${br} 0 0 1 ${x + 1 - br} ${y + 1}` : "") +
        `H${x + bl}` +
        (bl ? `A${bl} ${bl} 0 0 1 ${x} ${y + 1 - bl}` : "") +
        `V${y + tl}` +
        (tl ? `A${tl} ${tl} 0 0 1 ${x + tl} ${y}` : "") +
        "Z";
    }
  }

  // «Глазки»: кольцо 7×7 (extra-rounded) и точка 3×3.
  const eye = (r, c) => {
    const x = c + margin;
    const y = r + margin;
    return (
      `<path fill-rule="evenodd" d="M${x + 2.5} ${y}h2a2.5 2.5 0 0 1 2.5 2.5v2a2.5 2.5 0 0 1-2.5 2.5h-2a2.5 2.5 0 0 1-2.5-2.5v-2a2.5 2.5 0 0 1 2.5-2.5Z` +
      `M${x + 2.5} ${y + 1}a1.5 1.5 0 0 0-1.5 1.5v2a1.5 1.5 0 0 0 1.5 1.5h2a1.5 1.5 0 0 0 1.5-1.5v-2a1.5 1.5 0 0 0-1.5-1.5Z"/>` +
      `<rect x="${x + 2}" y="${y + 2}" width="3" height="3" rx="1"/>`
    );
  };

  const logoSvg = logo
    ? `<svg x="${holeStart + margin}" y="${holeStart + margin}" width="${hole}" height="${hole}" viewBox="0 0 512 512">${LOGO}</svg>`
    : "";

  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" shape-rendering="geometricPrecision" class="pretty-qr">` +
    (background !== "transparent" ? `<rect width="${size}" height="${size}" fill="${background}"/>` : "") +
    `<g fill="${color}"><path d="${d}"/>${eye(0, 0)}${eye(0, n - 7)}${eye(n - 7, 0)}</g>` +
    logoSvg +
    "</svg>"
  );
}
