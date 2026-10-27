// Android-приложение: полосы под строкой состояния и навигацией — в цвет темы приложения
// (нативный плагин SystemBars), как public/js/lib/systemBars.js. Без этого в тёмной теме
// сверху и снизу были белые полосы.
type BarsWindow = Window & {
  Capacitor?: { isNativePlatform?: () => boolean; Plugins?: { SystemBars?: { setColor: (o: { color: string; light: boolean }) => Promise<void> } } };
};

function toRgb(cssColor: string) {
  const probe = document.createElement("span");
  probe.style.color = cssColor;
  document.body.appendChild(probe);
  const rgb = getComputedStyle(probe).color.match(/\d+(\.\d+)?/g)?.map(Number) ?? [255, 255, 255];
  probe.remove();
  return rgb;
}

export function startSystemBarsSync() {
  const cap = (window as BarsWindow).Capacitor;
  const plugin = cap?.isNativePlatform?.() ? cap.Plugins?.SystemBars : null;
  if (!plugin) return () => {};
  let last = "";
  const sync = () => {
    const css = getComputedStyle(document.documentElement).getPropertyValue("--color-surface").trim() || "#ffffff";
    const [r = 255, g = 255, b = 255] = toRgb(css);
    const hex = `#${[r, g, b].map((v) => Math.round(v).toString(16).padStart(2, "0")).join("")}`;
    if (hex === last) return;
    last = hex;
    // Светлый фон → тёмные значки времени и батареи (и наоборот).
    plugin.setColor({ color: hex, light: (0.299 * r + 0.587 * g + 0.114 * b) / 255 > 0.6 }).catch(() => {});
  };
  sync();
  const observer = new MutationObserver(sync);
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme", "style"] });
  const media = window.matchMedia?.("(prefers-color-scheme: dark)");
  media?.addEventListener?.("change", sync);
  return () => {
    observer.disconnect();
    media?.removeEventListener?.("change", sync);
  };
}
