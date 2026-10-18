const db = require("../db");
const { listUsersWithBirthdayToday, getUser } = require("../data/users");
const { listOwnersOf } = require("../data/contacts");
const { SYSTEM_BOT_ID } = require("../data/systemBot");
const { findOrCreateDm, sendMessageAndBroadcast } = require("./systemChat");
const { sendPushToUser, MESSAGE_PUSH } = require("../push");

const SWEEP_INTERVAL_MS = 60 * 60 * 1000;

function alreadySent(ownerId, birthdayUserId, year) {
  return !!db
    .prepare("SELECT 1 FROM birthday_greetings_sent WHERE ownerId = ? AND birthdayUserId = ? AND year = ?")
    .get(ownerId, birthdayUserId, year);
}

function markSent(ownerId, birthdayUserId, year) {
  db.prepare(
    "INSERT OR IGNORE INTO birthday_greetings_sent (ownerId, birthdayUserId, year, sentAt) VALUES (?, ?, ?, ?)"
  ).run(ownerId, birthdayUserId, year, new Date().toISOString());
}

const BIRTHDAY_GIFT_SUGGESTIONS = [
  { id: "shalter_crab_birthday", emoji: "🎂", name: "Краб поздравляет" },
  { id: "shalter_crab_party", emoji: "🎉", name: "Вечеринка с крабом" },
  { id: "cake", emoji: "🎂", name: "Торт" },
  { id: "shalter_crab_hello", emoji: "🦀", name: "Краб приветствует" },
  { id: "shalter_crab_hug", emoji: "🦀", name: "Обнимашки от краба" },
  { id: "party_pop", emoji: "🥳", name: "Поздравление" },
  { id: "crab_cake_slice", emoji: "🍰", name: "Кусочек торта от краба" },
  { id: "crab_cake_whole", emoji: "🎂", name: "Целый торт от краба" },
  { id: "crab_ice_cream", emoji: "🍦", name: "Мороженое для краба" },
  { id: "crab_cupcake", emoji: "🧁", name: "Капкейк для краба" },
  { id: "crab_candy", emoji: "🍬", name: "Конфета для краба" },
  { id: "crab_lollipop", emoji: "🍭", name: "Леденец для краба" },
  { id: "crab_chocolate", emoji: "🍫", name: "Шоколад для краба" },
  { id: "crab_donut", emoji: "🍩", name: "Пончик для краба" },
  { id: "crab_pizza", emoji: "🍕", name: "Пицца для краба" },
  { id: "crab_popcorn", emoji: "🍿", name: "Попкорн для краба" },
  { id: "crab_cocktail", emoji: "🍹", name: "Коктейль для краба" },
  { id: "crab_champagne", emoji: "🍾", name: "Шампанское для краба" },
  { id: "crab_toast", emoji: "🥂", name: "Тост за краба" },
  { id: "crab_candle", emoji: "🕯️", name: "Свеча для краба" },
  { id: "crab_party_hat", emoji: "🎩", name: "Вечеринка в шляпе краба" },
  { id: "crab_present", emoji: "🎁", name: "Подарок для краба" },
  { id: "crab_balloon", emoji: "🎈", name: "Шарик для краба" },
  { id: "crab_confetti", emoji: "🎊", name: "Конфетти для краба" },
  { id: "crab_fireworks", emoji: "🎆", name: "Фейервер для краба" },
  { id: "crab_star", emoji: "⭐", name: "Звезда для краба" },
  { id: "crab_heart", emoji: "💖", name: "Сердце для краба" },
  { id: "crab_kiss", emoji: "💋", name: "Поцелуй для краба" },
  { id: "crab_dance_slow", emoji: "🦗", name: "Медленный танец краба" },
  { id: "crab_dance_fast", emoji: "🦘", name: "Быстрый танец краба" },
  { id: "crab_dj", emoji: "🎧", name: "Краб-диджей" },
  { id: "crab_guitar", emoji: "🎸", name: "Гитара для краба" },
  { id: "crab_drums", emoji: "🥁", name: "Барабаны для краба" },
  { id: "crab_trumpet", emoji: "🎺", name: "Труба для краба" },
  { id: "crab_microphone", emoji: "🎤", name: "Микрофон для краба" },
  { id: "crab_sunhat", emoji: "👒", name: "Краб в широкополой шляпе" },
  { id: "crab_sunglasses", emoji: "🕶️", name: "Краб в тёмных очках" },
  { id: "crab_crown", emoji: "👑", name: "Корона для краба" },
  { id: "crab_scepter", emoji: "🪄", name: "Скипетр для краба" },
  { id: "crab_helmet", emoji: "🪖", name: "Шлем для краба" },
  { id: "crab_anchor", emoji: "⚓", name: "Якорь для краба" },
  { id: "crab_boat", emoji: "⛵", name: "Лодка для краба" },
  { id: "crab_seashell", emoji: "🐚", name: "Ракушка для краба" },
  { id: "crab_seaweed", emoji: "🌿", name: "Водоросли для краба" },
  { id: "crab_pearl", emoji: "🦪", name: "Жемчужина для краба" },
  { id: "crab_lifebuoy", emoji: "🛟", name: "Спасательный круг для краба" },
  { id: "crab_sandcastle", emoji: "🏖️", name: "Замок из песка для краба" },
  { id: "crab_towel", emoji: "🧻", name: "Полотенце для краба" },
  { id: "crab_sunscreen", emoji: "🧴", name: "Солнцезащитный крем для краба" },
  { id: "crab_umbrella", emoji: "☂️", name: "Зонтик для краба" },
];

async function sweepOnce() {
  const birthdayUsers = listUsersWithBirthdayToday();
  if (!birthdayUsers.length) return;
  const year = new Date().getFullYear();

  for (const person of birthdayUsers) {
    const ownerIds = listOwnersOf(person.id).filter((id) => id !== person.id);
    for (const ownerId of ownerIds) {
      if (alreadySent(ownerId, person.id, year)) continue;
      try {
        const chat = await findOrCreateDm(SYSTEM_BOT_ID, ownerId);
        await sendMessageAndBroadcast(
          chat,
          SYSTEM_BOT_ID,
          `🎂 Сегодня день рождения у ${person.name}! Поздравьте и, если хотите — подарите подарок.`,
          {
            attachments: [{
              kind: "birthday",
              meta: {
                userId: person.id,
                name: person.name,
                avatarImage: person.avatarImage || null,
                suggestedGifts: BIRTHDAY_GIFT_SUGGESTIONS,
              },
            }],
          }
        );
        sendPushToUser(
          ownerId,
          { title: "Сегодня день рождения 🎂", body: `У ${person.name} день рождения — загляните в чат`, url: `/chat/${chat.id}`, tag: `birthday-${person.id}-${year}` },
          MESSAGE_PUSH
        ).catch(() => {});
      } catch (err) {
        console.error(`birthday greeting failed (owner ${ownerId}, birthday person ${person.id}):`, err);
      } finally {
        markSent(ownerId, person.id, year);
      }
    }
  }
}

function startBirthdaySweep() {
  setInterval(() => {
    sweepOnce().catch((err) => console.error("birthday sweep failed:", err));
  }, SWEEP_INTERVAL_MS);
  sweepOnce().catch((err) => console.error("birthday sweep failed:", err));
}

module.exports = { startBirthdaySweep, sweepOnce };
