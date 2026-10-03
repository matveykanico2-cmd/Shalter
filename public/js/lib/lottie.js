// Lottie-анимации из tweb (public/tgs/*.json) — подарки и стикеры как в Telegram.
// Плеер lottie-web грузится лениво, только когда на экране впервые появляется анимация.

const PLAYER_SRC = "/js/vendor/lottie_light.min.js";

// Подарок → анимация. Сначала по id подарка, потом по эмодзи.
const BY_ID = {
  cake: "Cake",
  premium_week: "StarReaction",
  premium_month: "Gift6",
  premium_quarter: "Gift3",
  premium_year: "Gift12",
  premium_forever: "Diamond",
  hlopushka_s_konfetti: "Congratulations",
  kubik: "Cubigator2",
  podarochnaya_korobka: "Gift3",
  zolotoy_klyuch: "key",
  tw_love_letter: "LoveLetter",
  tw_mailbox: "Mailbox",
  tw_duck_birthday: "UtyanBirthday",
  tw_pirate_flag: "jolly_roger",
  tw_duck_spy: "UtyanDisappear",
  tw_duck_popcorn: "UtyanDiscussion",
  tw_duck_portal: "UtyanLinks",
  tw_duck_safe: "UtyanPasscode",
  tw_duck_stop: "UtyanRestricted",
  tw_duck_detective: "UtyanSearch",
  tw_duck_album: "UtyanStories",
  tw_duck_vacation: "ChatAutomation",
  tw_monkey: "TwoFactorSetupMonkeyIdle",
  tw_hand: "hand_stop",
  tw_chart: "StatsEmoji",
  tw_folders: "Folders_1",
  tw_spider_folder: "EmptyFolder",
  tw_monkey_close: "TwoFactorSetupMonkeyClose",
  tw_monkey_peek: "TwoFactorSetupMonkeyPeek",
  tw_monkey_curious: "TwoFactorSetupMonkeyTracking",
  tw_blueprints: "Folders_2",
  tw_cloud_folder: "Folders_Shared",
  tw_halo_star: "StarReactionSelect",
};

const BY_EMOJI = {
  "🎂": "Cake",
  "🎉": "Congratulations",
  "🎲": "Cubigator2",
  "🎁": "Gift3",
  "💌": "LoveLetter",
  "📬": "Mailbox",
  "🐥": "UtyanBirthday",
  "🏴‍☠️": "jolly_roger",
  "🗝️": "key",
  "🔑": "key",
  "💎": "Diamond",
  "⭐": "StarReaction",
  "🕵️": "UtyanDisappear",
  "🍿": "UtyanDiscussion",
  "🌀": "UtyanLinks",
  "🔐": "UtyanPasscode",
  "🚫": "UtyanRestricted",
  "🔍": "UtyanSearch",
  "🖼️": "UtyanStories",
  "🏖️": "ChatAutomation",
  "🐵": "TwoFactorSetupMonkeyIdle",
  "✋": "hand_stop",
  "📊": "StatsEmoji",
  "🗂️": "Folders_1",
  "🕸️": "EmptyFolder",
  "🙈": "TwoFactorSetupMonkeyClose",
  "🫣": "TwoFactorSetupMonkeyPeek",
  "🐒": "TwoFactorSetupMonkeyTracking",
  "🗃️": "Folders_2",
  "☁️": "Folders_Shared",
  "😇": "StarReactionSelect",
};

export function lottieNameFor(item) {
  if (!item) return null;
  return BY_ID[item.giftId] ?? BY_ID[item.id] ?? BY_EMOJI[item.emoji] ?? null;
}

let playerPromise = null;
function loadPlayer() {
  if (window.lottie) return Promise.resolve(window.lottie);
  playerPromise ??= new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = PLAYER_SRC;
    s.async = true;
    s.onload = () => resolve(window.lottie);
    s.onerror = () => {
      playerPromise = null;
      reject(new Error("lottie"));
    };
    document.head.appendChild(s);
  });
  return playerPromise;
}

const dataCache = new Map();
function loadData(name) {
  if (!dataCache.has(name)) {
    dataCache.set(
      name,
      fetch(`/tgs/${name}.json`).then((r) => {
        if (!r.ok) throw new Error(`tgs ${name}`);
        return r.text();
      })
    );
  }
  return dataCache.get(name);
}

// Анимации, чей контейнер убрали со страницы, освобождаем — иначе SVG и таймеры копятся.
const live = new Set();
let sweepTimer = null;
function track(entry) {
  live.add(entry);
  sweepTimer ??= setInterval(() => {
    for (const e of live) {
      if (!e.box.isConnected) {
        e.anim.destroy();
        live.delete(e);
      }
    }
    if (!live.size) {
      clearInterval(sweepTimer);
      sweepTimer = null;
    }
  }, 3000);
}

/**
 * Контейнер с Lottie-анимацией.
 * replay: true — играет при появлении и повторяет по наведению/нажатию;
 * replay: false — показывает статичный кадр и оживает только при наведении.
 */
export function renderLottie(name, { size = 84, replay = true, loop = false, fallback = null, rest = "last" } = {}) {
  const box = document.createElement("span");
  box.className = "lottie-art";
  box.style.width = `${size}px`;
  box.style.height = `${size}px`;

  Promise.all([loadPlayer(), loadData(name)])
    .then(([lottie, text]) => {
      const anim = lottie.loadAnimation({
        container: box,
        renderer: "svg",
        loop,
        autoplay: false,
        animationData: JSON.parse(text),
        rendererSettings: { preserveAspectRatio: "xMidYMid meet", progressiveLoad: true },
      });
      track({ box, anim });
      // Кадр покоя: у подарков — последний (собранная картинка), у эмодзи Noto — первый.
      const restFrame = () => (rest === "first" ? 0 : Math.max(0, anim.totalFrames - 1));
      const replayFromStart = () => anim.goToAndPlay(0, true);
      anim.addEventListener("DOMLoaded", () => {
        box.classList.add("ready");
        if (replay) anim.play();
        else anim.goToAndStop(restFrame(), true);
      });
      if (!replay) anim.addEventListener("complete", () => anim.goToAndStop(restFrame(), true));
      const host = () => box.closest("button, a, .gift-message, .gift-card-emoji") ?? box;
      host().addEventListener("mouseenter", () => anim.isPaused && replayFromStart());
      box.addEventListener("click", () => anim.isPaused && replayFromStart());
    })
    .catch(() => {
      if (fallback) box.replaceWith(fallback());
    });

  return box;
}
