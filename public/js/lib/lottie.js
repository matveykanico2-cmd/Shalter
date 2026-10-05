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
  tw_star_fall: "StarReactionAppear",
  tg_plush_pepe: "PlushPepe",
  tw_monkey_shy: "TwoFactorSetupMonkeyCloseAndPeek",
  tw_gift_blue: "Gift6",
  tw_gift_red: "Gift12",
  // анимированные эмодзи Noto (public/tgs/emoji)
  raduga: "emoji/1f308",
  rose: "emoji/1f339",
  pitstsa: "emoji/1f355",
  shampanskoe: "emoji/1f37e",
  sharik: "emoji/1f388",
  serpantin: "emoji/1f38a",
  kotenok: "emoji/1f431",
  buket_tsvetov: "emoji/1f490",
  ogonek: "emoji/1f525",
  edinorog: "emoji/1f984",
  coffee: "emoji/2615",
  futbolnyy_myach: "emoji/26bd",
  snezhinka: "emoji/2744",
  heart: "emoji/2764",
  iskry: "emoji/2728",
  bokaly: "emoji/1f942",
  raketa: "emoji/1f680",
  nt_ghost: "emoji/1f47b",
  nt_alien: "emoji/1f47d",
  nt_kiss: "emoji/1f48b",
  nt_sparkling_heart: "emoji/1f496",
  nt_heart_arrow: "emoji/1f498",
  nt_blue_heart: "emoji/1f499",
  nt_green_heart: "emoji/1f49a",
  nt_yellow_heart: "emoji/1f49b",
  nt_purple_heart: "emoji/1f49c",
  nt_orange_heart: "emoji/1f9e1",
  nt_black_heart: "emoji/1f5a4",
  nt_hundred: "emoji/1f4af",
  nt_cool: "emoji/1f60e",
  nt_love_eyes: "emoji/1f60d",
  nt_robot: "emoji/1f916",
  nt_cowboy: "emoji/1f920",
  nt_clown: "emoji/1f921",
  nt_hands_heart: "emoji/1faf6",
  nt_hug: "emoji/1f917",
  nt_devil: "emoji/1f608",
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

// Картинка эмодзи-подарка из public/gift-emoji/<кодовые точки>.png — тем же
// именем, что и в BY_ID/BY_EMOJI. Нужна там, где своего lottie у подарка нет:
// файла есть не для каждого эмодзи, и тогда renderEmojiArt откатится на эмодзи.
export function emojiArtName(emoji) {
  const key = String(emoji ?? "").trim();
  if (!key) return null;
  return `emoji/${[...key].map((ch) => ch.codePointAt(0).toString(16)).join("")}`;
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
      fetch(/^https:\/\//.test(name) ? name : `/tgs/${name}.json`).then((r) => {
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
// Один наблюдатель на все анимации с playOnView: проигрываем, когда элемент впервые виден.
let viewObserver = null;
function observeView(box, play) {
  if (typeof IntersectionObserver === "undefined") return play();
  viewObserver ??= new IntersectionObserver((entries) => {
    for (const e of entries) {
      if (!e.isIntersecting) continue;
      viewObserver.unobserve(e.target);
      e.target._playOnView?.();
    }
  }, { threshold: 0.6 });
  box._playOnView = play;
  viewObserver.observe(box);
}

// Подарки-эмодзи (rose, heart, nt_robot…) в tweb — это PNG-картинки из
// assets/img/emoji, а не lottie-файлы. Раньше таких файлов не было, и подарок
// показывался голым символом эмодзи. Рисуем картинку, а при её отсутствии — эмодзи.
export function renderEmojiArt(name, { size = 84, replay = true, fallback = null } = {}) {
  const cp = String(name ?? "").replace(/^emoji\//, "");
  if (!cp) return fallback ? fallback() : null;
  const box = document.createElement("span");
  box.className = "lottie-art gift-emoji-art-box";
  box.style.width = `${size}px`;
  box.style.height = `${size}px`;
  const img = document.createElement("img");
  img.className = "gift-emoji-art";
  img.alt = "";
  img.decoding = "async";
  img.draggable = false;
  img.width = size;
  img.height = size;
  img.src = `/gift-emoji/${cp}.png`;
  img.addEventListener("error", () => box.replaceWith(fallback ? fallback() : document.createComment("")), { once: true });
  box.appendChild(img);
  return box;
}

export function renderLottie(name, { size = 84, replay = true, loop = false, fallback = null, rest = "last", playOnView = false } = {}) {  const box = document.createElement("span");
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
      // "mid" — у анимированных эмодзи-подарков: первый кадр бывает пустым или «нейтральным».
      const restFrame = () =>
        rest === "first" ? 0 : rest === "mid" ? Math.floor(Math.max(0, anim.totalFrames - 1) * 0.6) : Math.max(0, anim.totalFrames - 1);
      const replayFromStart = () => anim.goToAndPlay(0, true);
      anim.addEventListener("DOMLoaded", () => {
        box.classList.add("ready");
        if (replay) anim.play();
        else anim.goToAndStop(restFrame(), true);
        if (playOnView && !replay) observeView(box, replayFromStart);
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
