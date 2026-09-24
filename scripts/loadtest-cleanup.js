// Удаляет аккаунты, созданные нагрузочным тестом (scripts/loadtest.k6.js):
// у всех них email на @loadtest.invalid — домен .invalid зарезервирован и
// настоящему человеку принадлежать не может.
//
//   npm run loadtest:cleanup -- --dry-run   # только посчитать
//   npm run loadtest:cleanup                # удалить
//
// Удаление — тем же путём, что «Удалить аккаунт» в настройках
// (server/lib/deleteAccount.js): чаты, сообщения, сессии, контакты, боты.
// Запускать на сервере, из папки проекта — скрипт открывает ту же базу
// data/app.db, что и работающий сервер (SQLite это допускает), и берёт те же
// ключи шифрования из окружения.
const { listUsers } = require("../server/data/users");
const { deleteAccount } = require("../server/lib/deleteAccount");

const DOMAIN = "@loadtest.invalid";
const dryRun = process.argv.includes("--dry-run");

async function main() {
  const users = (await listUsers()).filter((u) => String(u.email ?? "").toLowerCase().endsWith(DOMAIN));
  console.log(`Тестовых аккаунтов (${DOMAIN}): ${users.length}`);
  if (dryRun || !users.length) return;

  let done = 0;
  for (const u of users) {
    await deleteAccount(u.id);
    done += 1;
    if (done % 100 === 0) console.log(`… ${done}/${users.length}`);
  }
  console.log(`Удалено: ${done}`);
}

main().then(
  () => process.exit(0),
  (err) => {
    console.error("Очистка прервана:", err.message);
    process.exit(1);
  }
);
