import { prettyQrSvg } from "./prettyQr.js";

// Картинка QR-кода для системного «Поделиться»: тот же вид, что на экране, но
// нарисованный на canvas — системное меню умеет отдавать файл, а собрать PNG из
// DOM без посторонних библиотек нельзя.
const SIZE = 1000;

function roundRect(ctx, x, y, w, h, r) {
  if (typeof ctx.roundRect === "function") {
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, r);
    return;
  }
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function loadImage(src) {
  return new Promise((resolve) => {
    if (!src) return resolve(null);
    const img = new Image();
    // Без crossOrigin картинка с другого домена испортит canvas — и PNG не выйдет.
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

function drawAvatar(ctx, img, { x, y, size, color, name }) {
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
    ctx.fillText(String(name ?? "?").trim().charAt(0).toUpperCase(), x + size / 2, y + size / 2 + 2);
  }
  ctx.restore();
}

export async function qrCardPng({ url, name, username, theme, avatarImage, avatarColor, hint }) {
  const canvas = document.createElement("canvas");
  canvas.width = SIZE;
  canvas.height = SIZE;
  const ctx = canvas.getContext("2d");
  const ink = theme?.ink ?? "#2f5bd8";
  const from = theme?.from ?? "#8fd0ff";
  const via = theme?.via ?? "#5b8cff";
  const to = theme?.to ?? "#7c6cf0";

  const grad = ctx.createLinearGradient(0, 0, SIZE, SIZE);
  grad.addColorStop(0, from);
  grad.addColorStop(0.55, via);
  grad.addColorStop(1, to);
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
  const avatarX = (SIZE - avatarSize) / 2;
  const avatarY = card.y - avatarSize / 2;
  ctx.fillStyle = "#fff";
  ctx.beginPath();
  ctx.arc(SIZE / 2, card.y, avatarSize / 2 + 6, 0, Math.PI * 2);
  ctx.fill();
  drawAvatar(ctx, await loadImage(avatarImage), { x: avatarX, y: avatarY, size: avatarSize, color: avatarColor, name });

  const qrSide = 440;
  const qrX = (SIZE - qrSide) / 2;
  const qrY = 300;
  const qrSvg = prettyQrSvg(url, { color: ink });
  const qrImg = await loadImage(`data:image/svg+xml;base64,${btoa(unescape(encodeURIComponent(qrSvg)))}`);
  if (qrImg) ctx.drawImage(qrImg, qrX, qrY, qrSide, qrSide);

  // В центре кода prettyQrSvg оставляет место под логотип (см. prettyQr.js).
  ctx.fillStyle = "#fff";
  ctx.beginPath();
  ctx.arc(SIZE / 2, qrY + qrSide / 2, qrSide * 0.11, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = ink;
  ctx.font = `700 ${Math.round(qrSide * 0.15)}px system-ui, -apple-system, "Segoe UI", Roboto, sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("S", SIZE / 2, qrY + qrSide / 2 + 2);

  ctx.fillStyle = "#111";
  ctx.font = '600 42px system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';
  ctx.fillText(String(name ?? username ?? "").slice(0, 28), SIZE / 2, card.y + card.h - 96);
  ctx.fillStyle = ink;
  ctx.font = '500 30px system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';
  ctx.fillText(`@${username ?? ""}`, SIZE / 2, card.y + card.h - 44);
  if (hint) {
    ctx.fillStyle = "rgba(17, 17, 17, 0.55)";
    ctx.font = '400 24px system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';
    ctx.fillText(hint.slice(0, 48), SIZE / 2, card.y + card.h + 56);
  }

  return new Promise((resolve) => canvas.toBlob((b) => resolve(b), "image/png"));
}