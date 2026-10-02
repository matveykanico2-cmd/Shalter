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
    http_req_duration: ["p(95)<800"],
    http_req_failed: ["rate<0.01"],
    shalter_send_message_ms: ["p(95)<100000000"],
  },
};

const JSON_HEADERS = { headers: { "Content-Type": "application/json" } };

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
