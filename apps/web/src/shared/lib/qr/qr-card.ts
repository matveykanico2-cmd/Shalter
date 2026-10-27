import { LOGO, prettyQrSvg } from "./pretty-qr";

// Картинка QR-кода для системного «Поделиться» (public/js/lib/qrCard.js): тот же вид, что на
// экране, но нарисованный на canvas — системное меню умеет отдавать файл, а собрать PNG из
// DOM без посторонних библиотек нельзя.
const SIZE = 1000;

export type QrTheme = { id: string; bg: string; ink: string; from: string; via: string; to: string };

type CardOptions = {
  url: string;
  name: string;
  username: string | null;
  theme: QrTheme;
  avatarImage?: string | null;
  avatarColor?: string | null;
  hint?: string;
};

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  if (typeof ctx.roundRect === "function") {
    ctx.roundRect(x, y, w, h, r);
    return;
  }
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function loadImage(src: string | null | undefined) {
  return new Promise<HTMLImageElement | null>((resolve) => {
    if (!src) return resolve(null);
    const img = new Image();
    // Без crossOrigin картинка с другого домена испортит canvas — и PNG не выйдет.
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

function drawAvatar(ctx: CanvasRenderingContext2D, img: HTMLImageElement | null, { x, y, size, color, name }: { x: number; y: number; size: number; color?: string | null; name: string }) {
  ctx.save();
  ctx.beginPath();
  ctx.arc(x + size / 2, y + size / 2, size / 2, 0, Math.PI * 2);
  ctx.closePath();
  ctx.clip();
  if (img) {
    const side = Math.min(img.width, img.height) || size;
    ctx.drawImage(img, x + (size - side) / 2, y + (size - side) / 2, side, side);
  } else {
    ctx.fillStyle = color || "#5b8cff";
    ctx.fillRect(x, y, size, size);
    ctx.fillStyle = "#fff";
    ctx.font = `600 ${Math.round(size * 0.44)}px system-ui, -apple-system, "Segoe UI", Roboto, sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(name.trim().charAt(0).toUpperCase() || "?", x + size / 2, y + size / 2 + 2);
  }
  ctx.restore();
}

const svgData = (svg: string) => `data:image/svg+xml;base64,${btoa(unescape(encodeURIComponent(svg)))}`;

export async function qrCardPng({ url, name, username, theme, avatarImage, avatarColor, hint }: CardOptions) {
  const canvas = document.createElement("canvas");
  canvas.width = SIZE;
  canvas.height = SIZE;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Не удалось нарисовать картинку");

  const grad = ctx.createLinearGradient(0, 0, SIZE, SIZE);
  grad.addColorStop(0, theme.from);
  grad.addColorStop(0.55, theme.via);
  grad.addColorStop(1, theme.to);
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, SIZE, SIZE);

  // Белая карточка с аватаром, выходящим за её верхний край — как на экране.
  const card = { x: 90, y: 180, w: SIZE - 180, h: 660, r: 44 };
  ctx.save();
  ctx.shadowColor = "rgba(0, 0, 0, 0.18)";
  ctx.shadowBlur = 32;
  ctx.shadowOffsetY = 10;
  ctx.fillStyle = "#fff";
  roundRect(ctx, card.x, card.y, card.w, card.h, card.r);
  ctx.fill();
  ctx.restore();

  const avatarSize = 168;
  ctx.fillStyle = "#fff";
  ctx.beginPath();
  ctx.arc(SIZE / 2, card.y, avatarSize / 2 + 6, 0, Math.PI * 2);
  ctx.fill();
  drawAvatar(ctx, await loadImage(avatarImage), { x: (SIZE - avatarSize) / 2, y: card.y - avatarSize / 2, size: avatarSize, color: avatarColor, name });

  const qrSide = 420;
  const qrX = (SIZE - qrSide) / 2;
  const qrY = 286;
  // Код без встроенного логотипа (вложенный svg в картинке рисуется не везде),
  // а в оставленное место — сам логотип Shalter отдельной картинкой.
  const qrSvg = prettyQrSvg(url, { color: theme.ink }).replace(/<svg x="[^"]*" y="[^"]*" width="[^"]*" height="[^"]*" viewBox="0 0 512 512">[\s\S]*?<\/svg>(?=<\/svg>$)/, "");
  const qrImg = await loadImage(svgData(qrSvg));
  if (qrImg) ctx.drawImage(qrImg, qrX, qrY, qrSide, qrSide);

  const logoSide = qrSide * 0.2;
  ctx.fillStyle = "#fff";
  ctx.beginPath();
  ctx.arc(SIZE / 2, qrY + qrSide / 2, logoSide / 2 + 8, 0, Math.PI * 2);
  ctx.fill();
  const logoImg = await loadImage(svgData(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512">${LOGO}</svg>`));
  if (logoImg) ctx.drawImage(logoImg, SIZE / 2 - logoSide / 2, qrY + qrSide / 2 - logoSide / 2, logoSide, logoSide);
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";

  ctx.fillStyle = "#111";
  ctx.font = '600 42px system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';
  ctx.fillText((name || username || "").slice(0, 28), SIZE / 2, card.y + card.h - 82);
  ctx.fillStyle = theme.ink;
  ctx.font = '500 30px system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';
  ctx.fillText(`@${username ?? ""}`, SIZE / 2, card.y + card.h - 36);
  if (hint) {
    ctx.fillStyle = "rgba(17, 17, 17, 0.55)";
    ctx.font = '400 24px system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';
    ctx.fillText(hint.slice(0, 48), SIZE / 2, card.y + card.h + 56);
  }

  return new Promise<Blob>((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("Не удалось нарисовать картинку"))), "image/png"));
}
