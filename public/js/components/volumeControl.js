import { el } from "../lib/dom.js";
import { iconSvg } from "../icons.js";
import { getVolume, setVolume, applyVolumeToAll } from "../lib/mediaVolume.js";

// Ползунок громкости входящего звука — один и тот же в звонке и в эфире.
//
// Живёт вне перерисовки: и звонок, и эфир пересобирают экран на каждое событие
// (новый участник, сообщение в чат эфира), а ползунок, пересозданный под
// пальцем, теряет захват — тянешь, и он бросает на полпути. Поэтому узел
// создаётся один раз и переиспользуется, как <video> там же.
//
// Нажатие на значок — быстрое «выключить/вернуть»: без него, чтобы приглушить
// собеседника на секунду, ползунок надо увести в ноль и потом на слух искать,
// где было.
export function VolumeControl({ compact = false } = {}) {
  let lastNonZero = getVolume() || 1;

  const slider = el("input", {
    type: "range",
    class: "volume-slider",
    min: "0",
    max: "100",
    step: "1",
    value: String(Math.round(getVolume() * 100)),
    title: "Громкость",
    oninput: (e) => {
      const next = Number(e.target.value) / 100;
      if (next > 0) lastNonZero = next;
      setVolume(next);
      paint(next);
    },
  });

  const button = el("button", {
    class: "volume-btn",
    type: "button",
    title: "Выключить звук",
    onclick: () => {
      const next = getVolume() > 0 ? 0 : lastNonZero;
      setVolume(next);
      slider.value = String(Math.round(next * 100));
      paint(next);
    },
  });

  const value = el("span", { class: "volume-value" });
  const wrap = el("div", { class: `volume-control ${compact ? "compact" : ""}` }, [button, slider, value]);

  function paint(v) {
    button.innerHTML = iconSvg(v > 0 ? "Volume" : "VolumeOff", 18);
    button.title = v > 0 ? "Выключить звук" : "Вернуть звук";
    value.textContent = `${Math.round(v * 100)}%`;
    // Заливка левой части дорожки — обычный range рисует её только в WebKit.
    slider.style.setProperty("--volume-fill", `${Math.round(v * 100)}%`);
    wrap.classList.toggle("muted", v === 0);
  }

  paint(getVolume());
  // Элементы <video> могли появиться раньше ползунка (звонок соединяется, пока
  // экран ещё собирается) — прогоняем сохранённую громкость по ним сразу.
  applyVolumeToAll();

  return wrap;
}
