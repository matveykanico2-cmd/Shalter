const { getSettings } = require("../data/settings");
const { listContactsFor } = require("../data/contacts");

// Настройки конфиденциальности — «Все / Мои контакты / Никто» плюс поимённые
// исключения из выбранного правила.
//
// Правило одно на всех, а живые договорённости — нет: номер показан всем, кроме
// одного человека; последний визит скрыт от всех, кроме двоих. До появления
// исключений такой случай приходилось решать выбором «Никто» и объяснением на
// словах, либо не решать вовсе.
//
// Хранятся исключения там же, где сами уровни, — в settings.privacy:
//   privacy.exceptions[key] = { allow: [userId…], deny: [userId…] }
// «allow» — «этому всегда можно», «deny» — «этому нельзя никогда». Оба списка
// вместе с уровнем составляют одно правило и читаются только через этот модуль,
// чтобы шесть мест, где конфиденциальность проверяется (профиль, поиск по
// номеру, пересылки, добавление в чаты, звонки, боты), не разошлись каждое по
// своему пониманию.
const LEVELS = new Set(["everyone", "contacts", "nobody"]);

// Ключи, у которых исключения имеют смысл, — то есть все настройки уровня.
// Список нужен и клиенту (см. views/settings/index.js), и нормализации ниже.
const PRIVACY_KEYS = [
  "lastSeen",
  "phone",
  "discoverByPhone",
  "photo",
  "bio",
  "birthday",
  "forwards",
  "invites",
  "calls",
  "botMessages",
];

// Сколько человек можно внести в один список. Не защита от злоупотребления, а
// граница здравого смысла: исключения — это «кроме вот этих двоих», а не второй
// способ вести список контактов.
const MAX_PER_LIST = 200;

function idsOf(value) {
  if (!Array.isArray(value)) return [];
  const out = [];
  for (const id of value) {
    if (typeof id !== "string" || !id) continue;
    if (!out.includes(id)) out.push(id);
    if (out.length >= MAX_PER_LIST) break;
  }
  return out;
}

function exceptionsFor(privacy, key) {
  const raw = privacy?.exceptions?.[key];
  return { allow: idsOf(raw?.allow), deny: idsOf(raw?.deny) };
}

// Приводит присланный клиентом privacy к тому, что здесь читается: настройки
// патчатся одним общим PATCH /api/settings без схемы, и мусор в списках
// исключений — это мусор, который потом молча решает, кому видно номер.
function normalizePrivacy(privacy) {
  if (!privacy || typeof privacy !== "object") return privacy;
  const next = { ...privacy };
  delete next.exceptions;
  const raw = privacy.exceptions;
  if (!raw || typeof raw !== "object") return next;
  const exceptions = {};
  for (const key of PRIVACY_KEYS) {
    const { allow, deny } = exceptionsFor({ exceptions: raw }, key);
    // «Никогда» сильнее «всегда» (см. privacyAllows), так что человек в обоих
    // списках сразу — это не выбор, а забытая строка: убираем её из allow, где
    // она всё равно ни на что не влияет.
    const cleanAllow = allow.filter((id) => !deny.includes(id));
    if (cleanAllow.length || deny.length) exceptions[key] = { allow: cleanAllow, deny };
  }
  if (Object.keys(exceptions).length) next.exceptions = exceptions;
  return next;
}

// Уровень + исключения → да/нет. isContact — «есть ли смотрящий в контактах у
// хозяина настройки» (именно в такую сторону, см. routes/users.js); нужен
// только для уровня "contacts", поэтому вызывающие, которым он достаётся
// дорого, пользуются allowsUser ниже.
function privacyAllows(privacy, key, viewerId, isContact) {
  const { allow, deny } = exceptionsFor(privacy, key);
  // «Никогда» перебивает всё, включая «Все»: это единственный порядок, при
  // котором запрет нельзя случайно отменить, ослабив общее правило.
  if (viewerId && deny.includes(viewerId)) return false;
  if (viewerId && allow.includes(viewerId)) return true;
  const level = LEVELS.has(privacy?.[key]) ? privacy[key] : "everyone";
  if (level === "everyone") return true;
  if (level === "nobody") return false;
  return !!isContact;
}

// То же самое, но само достаёт настройки хозяина и — только если дело дошло до
// уровня "contacts" — его список контактов. Порядок важен: у исключения список
// контактов не спрашивают вовсе, а это запрос в базу на каждую проверку.
async function allowsUser(ownerId, key, viewerId) {
  if (ownerId === viewerId) return true;
  const { privacy } = await getSettings(ownerId);
  const { allow, deny } = exceptionsFor(privacy, key);
  if (deny.includes(viewerId)) return false;
  if (allow.includes(viewerId)) return true;
  const level = LEVELS.has(privacy?.[key]) ? privacy[key] : "everyone";
  if (level === "everyone") return true;
  if (level === "nobody") return false;
  const contacts = await listContactsFor(ownerId);
  return contacts.some((c) => c.userId === viewerId);
}

module.exports = { PRIVACY_KEYS, privacyAllows, allowsUser, normalizePrivacy, exceptionsFor };
