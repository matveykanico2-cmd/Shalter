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
