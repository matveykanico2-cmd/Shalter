// Мем: картинка с подписями сверху и снизу — белым Impact с чёрной обводкой (public/js/components/memeDialog.js).
const MAX_DIM = 1080;
const LINE_HEIGHT = 1.15;
const FONT = (size: number) => `900 ${size}px Impact, Haettenschweiler, "Arial Narrow Bold", sans-serif`;

/** Слово шире строки — режем по буквам (только на самом мелком шрифте). */
function splitWord(ctx: CanvasRenderingContext2D, word: string, maxWidth: number) {
  if (ctx.measureText(word).width <= maxWidth) return [word];
  const parts: string[] = [];
  let part = "";
  for (const ch of word) {
    if (part && ctx.measureText(part + ch).width > maxWidth) {
      parts.push(part);
      part = ch;
    } else {
      part += ch;
    }
  }
  if (part) parts.push(part);
  return parts;
}

/** Подпись по строкам: шрифт уменьшается, пока текст не влезет в ширину и maxHeight. */
export function layoutCaption(ctx: CanvasRenderingContext2D, text: string, maxWidth: number, maxHeight: number, baseSize: number) {
  const words = text.toUpperCase().split(/\s+/).filter(Boolean);
  const minSize = Math.max(10, Math.round(baseSize * 0.35));
  let size = baseSize;
  for (;;) {
    ctx.font = FONT(size);
    const last = size <= minSize;
    const pieces = last ? words.flatMap((w) => splitWord(ctx, w, maxWidth)) : words;
    const lines: string[] = [];
    let line = "";
    let fits = true;
    for (const w of pieces) {
      if (ctx.measureText(w).width > maxWidth) fits = false;
      const test = line ? `${line} ${w}` : w;
      if (ctx.measureText(test).width > maxWidth && line) {
        lines.push(line);
        line = w;
      } else {
        line = test;
      }
    }
    if (line) lines.push(line);
    if (lines.length * size * LINE_HEIGHT > maxHeight) fits = false;
    if (fits || last) return { size, lines };
    size = Math.max(minSize, Math.floor(size * 0.9));
  }
}

function drawCaption(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, maxWidth: number, maxHeight: number, baseSize: number, anchor: "top" | "bottom") {
  const { size, lines } = layoutCaption(ctx, text, maxWidth, maxHeight, baseSize);
  ctx.font = FONT(size);
  ctx.textAlign = "center";
  ctx.textBaseline = anchor;
  ctx.lineWidth = Math.max(3, size * 0.14);
  ctx.strokeStyle = "#000";
  ctx.fillStyle = "#fff";
  ctx.lineJoin = "round";
  const lineHeight = size * LINE_HEIGHT;
  lines.forEach((l, i) => {
    const ly = anchor === "top" ? y + i * lineHeight : y - (lines.length - 1 - i) * lineHeight;
    ctx.strokeText(l, x, ly);
    ctx.fillText(l, x, ly);
  });
}

/** Рисует мем на canvas: картинка до 1080 px по большей стороне и подписи. */
export function drawMeme(canvas: HTMLCanvasElement, image: HTMLImageElement, topText: string, bottomText: string) {
  const scale = Math.min(1, MAX_DIM / Math.max(image.naturalWidth, image.naturalHeight));
  const w = Math.max(1, Math.round(image.naturalWidth * scale));
  const h = Math.max(1, Math.round(image.naturalHeight * scale));
  if (canvas.width !== w) canvas.width = w;
  if (canvas.height !== h) canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  ctx.drawImage(image, 0, 0, w, h);
  const fontSize = Math.round(Math.min(w, h * 1.2) * 0.1);
  const pad = Math.round(fontSize * 0.3);
  const maxHeight = h * 0.42;
  if (topText.trim()) drawCaption(ctx, topText, w / 2, pad, w * 0.92, maxHeight, fontSize, "top");
  if (bottomText.trim()) drawCaption(ctx, bottomText, w / 2, h - pad, w * 0.92, maxHeight, fontSize, "bottom");
}
