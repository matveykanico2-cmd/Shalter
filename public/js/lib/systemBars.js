// Android-приложение: полосы под строкой состояния и навигацией — в цвет темы
// приложения (нативный плагин SystemBars, resources/android/java). Без этого там
// виден фон окна по теме *системы*, и в тёмной теме сверху и снизу были белые полосы.

function toHex(cssColor) {
  const probe = document.createElement("span");
  probe.style.color = cssColor;
  document.body.appendChild(probe);
  const rgb = getComputedStyle(probe).color.match(/\d+(\.\d+)?/g)?.map(Number) ?? [255, 255, 255];
  probe.remove();
  return { hex: `#${rgb.slice(0, 3).map((v) => Math.round(v).toString(16).padStart(2, "0")).join("")}`, rgb };
}

export function startSystemBarsSync() {
  const plugin = window.Capacitor?.isNativePlatform?.() ? window.Capacitor.Plugins?.SystemBars : null;
  if (!plugin) return;
  let last = "";
  const sync = () => {
    const css = getComputedStyle(document.documentElement).getPropertyValue("--color-surface").trim() || "#ffffff";
    const { hex, rgb } = toHex(css);
    if (hex === last) return;
    last = hex;
    // Светлый фон → тёмные значки времени и батареи (и наоборот).
    const light = (0.299 * rgb[0] + 0.587 * rgb[1] + 0.114 * rgb[2]) / 255 > 0.6;
    plugin.setColor({ color: hex, light }).catch(() => {});
  };
  sync();
  new MutationObserver(sync).observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
  window.matchMedia?.("(prefers-color-scheme: dark)").addEventListener?.("change", sync);
}
