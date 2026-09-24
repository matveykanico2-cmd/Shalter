// Нагрузочный тест Shalter — «набег пользователей» на свой сервер.
//
// Запускается программой k6 (https://k6.io), не Node'ом:
//
//   k6 run -e BASE=https://ваш-домен scripts/loadtest.k6.js
//   k6 run -e BASE=https://ваш-домен -e PEAK=300 scripts/loadtest.k6.js
//
// Что делает каждый виртуальный пользователь (VU), как живой человек:
// регистрирует себе аккаунт, открывает «Избранное», держит WebSocket (как
// открытая вкладка) и в цикле — список чатов, история, «печатает…»,
// сообщение — с паузами в несколько секунд между действиями.
//
// ВАЖНО перед запуском (подробно — в ответе/README):
// - поднимите на сервере на время теста API_RATE_LIMIT и AUTH_RATE_LIMIT
//   (server/middleware/rateLimit.js) и limit_req в nginx — все VU идут с
//   одного IP, и без этого вы измерите не сервер, а ограничитель (429);
// - сделайте резервную копию data/ — тест создаёт аккаунты и сообщения
//   (их email на @loadtest.invalid, по нему их потом легко найти и удалить).
import http from "k6/http";
import ws from "k6/ws";
import { check, sleep } from "k6";
import { Counter, Trend } from "k6/metrics";

const BASE = (__ENV.BASE || "http://localhost:3000").replace(/\/+$/, "");
const WS_BASE = BASE.replace(/^http/, "ws");
const PEAK = Number(__ENV.PEAK || 10000000);

const sendLatency = new Trend("shalter_send_message_ms", true);
const wsDelivered = new Counter("shalter_ws_events");
const failures = new Counter("shalter_failed_steps");

// Нарастание, плато, спад: так видно, при каком числе людей начинает расти
// задержка, а не только «выдержал / не выдержал».
export const options = {
  scenarios: {
    users: {
      executor: "ramping-vus",
      startVUs: 0,
      stages: [
        { duration: "1m", target: Math.round(PEAK * 1125) },
        { duration: "2m", target: PEAK },
        { duration: "3m", target: PEAK },
        { duration: "1m", target: 0 },
      ],
      gracefulRampDown: "30s",
    },
  },
  thresholds: {
    // 95% запросов быстрее 800 мс, ошибок меньше 1% — иначе k6 завершится с
    // ненулевым кодом и напишет, какой порог не выдержан.
    http_req_duration: ["p(95)<800"],
    http_req_failed: ["rate<0.01"],
    shalter_send_message_ms: ["p(95)<100000000"],
  },
};

const JSON_HEADERS = { headers: { "Content-Type": "application/json" } };

// Состояние VU между итерациями: аккаунт регистрируется один раз.
let me = null;
let savedChatId = null;

function register() {
  const tag = `${__VU}${Date.now().toString(36)}${Math.floor(Math.random() * 1e4)}`;
  const phoneTail = String(Math.floor(Math.random() * 1e7)).padStart(7, "0");
  const res = http.post(
    `${BASE}/api/auth/register-email`,
    JSON.stringify({
      name: `Нагрузка ${__VU}`,
      email: `lt_${tag}@loadtest.invalid`,
      password: "loadtest-password",
      phone: `+7999${phoneTail}`,
      username: `lt_${tag}`.slice(0, 32),
    }),
    JSON_HEADERS
  );
  if (!check(res, { "регистрация 200": (r) => r.status === 200 })) {
    failures.add(1, { step: "register" });
    return false;
  }
  me = res.json("user");
  // «Избранное» — чат с самим собой: сообщения идут через тот же путь, что и
  // обычные (шифрование, поиск, WebSocket), но не шлют push чужим людям.
  const chat = http.post(`${BASE}/api/chats`, JSON.stringify({ userId: me.id }), JSON_HEADERS);
  if (!check(chat, { "чат создан": (r) => r.status === 200 })) {
    failures.add(1, { step: "chat" });
    return false;
  }
  savedChatId = chat.json("chat.id");
  return true;
}

function think(min, max) {
  sleep(min + Math.random() * (max - min));
}

function userSession() {
  // Открытая вкладка: список чатов при входе, потом переписка.
  const boot = http.get(`${BASE}/api/bootstrap`, { tags: { name: "bootstrap" } });
  check(boot, { "bootstrap 200": (r) => r.status === 200 }) || failures.add(1, { step: "bootstrap" });

  for (let i = 0; i < 5; i++) {
    const list = http.get(`${BASE}/api/chats`, { tags: { name: "chats" } });
    check(list, { "чаты 200": (r) => r.status === 200 }) || failures.add(1, { step: "chats" });
    think(1, 3);

    const history = http.get(`${BASE}/api/chats/${savedChatId}/messages?limit=60`, { tags: { name: "history" } });
    check(history, { "история 200": (r) => r.status === 200 }) || failures.add(1, { step: "history" });
    think(1, 4);

    http.post(`${BASE}/api/chats/${savedChatId}/typing`, JSON.stringify({ action: "typing" }), {
      ...JSON_HEADERS,
      tags: { name: "typing" },
    });
    think(1, 3);

    const sent = http.post(
      `${BASE}/api/chats/${savedChatId}/messages`,
      JSON.stringify({ text: `нагрузочный тест ${__VU}/${__ITER}/${i} ${Date.now()}` }),
      { ...JSON_HEADERS, tags: { name: "send" } }
    );
    sendLatency.add(sent.timings.duration);
    check(sent, { "отправка 200": (r) => r.status === 200 }) || failures.add(1, { step: "send" });
    think(2, 6);
  }

  // Поиск — самый тяжёлый из частых запросов (отпечатки слов, FTS5).
  const search = http.get(`${BASE}/api/chats/${savedChatId}/messages/search?q=${encodeURIComponent("нагрузочный")}`, {
    tags: { name: "search" },
  });
  check(search, { "поиск 200": (r) => r.status === 200 }) || failures.add(1, { step: "search" });
}

export default function () {
  if (!me && !register()) {
    sleep(5);
    return;
  }

  // WebSocket живёт, пока VU «сидит в приложении», а HTTP-действия идут
  // внутри — так на сервере одновременно и соединения, и запросы, как в
  // жизни. Куки VU (сессия после регистрации) передаются вручную: k6 не
  // подставляет cookie-jar в ws.connect.
  const jar = http.cookieJar();
  const cookies = jar.cookiesForURL(BASE);
  const cookieHeader = Object.entries(cookies)
    .map(([k, v]) => `${k}=${v[0]}`)
    .join("; ");

  const res = ws.connect(`${WS_BASE}/ws`, { headers: { Cookie: cookieHeader } }, (socket) => {
    socket.on("message", () => wsDelivered.add(1));
    socket.on("error", () => failures.add(1, { step: "ws" }));
    socket.setTimeout(() => {
      userSession();
      socket.close();
    }, 1000);
  });
  check(res, { "ws 101": (r) => r && r.status === 101 }) || failures.add(1, { step: "ws-connect" });
  think(2, 5);
}
