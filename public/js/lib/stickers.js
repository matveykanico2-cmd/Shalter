// A curated "sticker" catalog — big animated emoji sent as their own message
// (see components/messageBubble.js's StickerMessage), each with its own
// motion so the set doesn't feel like one animation reused 30 times (same
// idea as Telegram's sticker packs each having distinct character motion).
// `anim` names a CSS animation defined in components.css (.sticker-<anim>).
// Нарисованный набор — не эмодзи, а собственная векторная графика с раздельно
// движущимися частями (lib/drawnArt.js). `scene` указывает, что именно рисовать;
// `emoji` остаётся как запасной вариант и как подпись в уведомлениях.
export const DRAWN_STICKERS = [
  { id: "art_hello", emoji: "👋", name: "Привет", scene: "hello" },
  { id: "art_love", emoji: "❤️", name: "Любовь", scene: "love" },
  { id: "art_thanks", emoji: "🙏", name: "Спасибо", scene: "thanks" },
  { id: "art_congrats", emoji: "🎉", name: "Поздравляю", scene: "congrats" },
  { id: "art_laugh", emoji: "😂", name: "Смех", scene: "laugh" },
  { id: "art_sad", emoji: "😢", name: "Грустно", scene: "sad" },
  { id: "art_sleep", emoji: "😴", name: "Сплю", scene: "sleep" },
  { id: "art_cool", emoji: "👍", name: "Класс", scene: "cool" },
  { id: "art_rose", emoji: "🌹", name: "Роза", scene: "rose" },
  { id: "art_teddy", emoji: "🧸", name: "Мишка", scene: "teddy" },
  { id: "art_cake", emoji: "🎂", name: "Торт", scene: "cake" },
  { id: "art_gift", emoji: "🎁", name: "Подарок", scene: "giftbox" },
];

export const STICKERS = [
  { id: "laugh", emoji: "😂", name: "Ржака", anim: "shake" },
  { id: "love", emoji: "😍", name: "Обожаю", anim: "heartbeat" },
  { id: "cry", emoji: "😭", name: "Рыдаю", anim: "shake-soft" },
  { id: "fire", emoji: "🔥", name: "Огонь", anim: "flicker" },
  { id: "thumbsup", emoji: "👍", name: "Класс", anim: "bounce" },
  { id: "party", emoji: "🥳", name: "Празднуем", anim: "tada" },
  { id: "heart", emoji: "❤️", name: "Люблю", anim: "heartbeat" },
  { id: "clap", emoji: "👏", name: "Браво", anim: "bounce" },
  { id: "think", emoji: "🤔", name: "Думаю", anim: "wobble" },
  { id: "wow", emoji: "😱", name: "Вау", anim: "tada" },
  { id: "cool", emoji: "😎", name: "Круто", anim: "swing" },
  { id: "wink", emoji: "😉", name: "Подмигиваю", anim: "wobble" },
  { id: "angry", emoji: "😡", name: "Злюсь", anim: "shake" },
  { id: "sleep", emoji: "😴", name: "Сплю", anim: "float" },
  { id: "kiss", emoji: "😘", name: "Целую", anim: "heartbeat" },
  { id: "facepalm", emoji: "🤦", name: "Фейспалм", anim: "shake-soft" },
  { id: "shrug", emoji: "🤷", name: "Хз", anim: "wobble" },
  { id: "star_eyes", emoji: "🤩", name: "В восторге", anim: "tada" },
  { id: "poop", emoji: "💩", name: "Фу", anim: "wobble" },
  { id: "skull", emoji: "💀", name: "Умираю", anim: "shake" },
  { id: "ghost", emoji: "👻", name: "Бу!", anim: "float" },
  { id: "robot", emoji: "🤖", name: "Бип-боп", anim: "shake" },
  { id: "unicorn", emoji: "🦄", name: "Волшебство", anim: "float" },
  { id: "100", emoji: "💯", name: "Сотка", anim: "tada" },
  { id: "ok", emoji: "👌", name: "Ок", anim: "bounce" },
  { id: "pray", emoji: "🙏", name: "Молюсь", anim: "float" },
  { id: "muscle", emoji: "💪", name: "Сила", anim: "bounce" },
  { id: "eyes", emoji: "👀", name: "Смотрю", anim: "wobble" },
];

export function getSticker(id) {
  return STICKERS.find((s) => s.id === id);
}
