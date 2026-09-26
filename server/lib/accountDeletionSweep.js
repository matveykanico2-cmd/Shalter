// Отложенное удаление аккаунтов — same plain-setInterval-scan shape as
// reminderSweep.js / scheduledMessagesSweep.js. Аккаунт помечается к удалению,
// если человек забыл и пароль, и облачный пароль и не смог войти
// (server/routes/auth.js's /schedule-deletion); через неделю его сносит этот
// проход. Любой успешный вход до срока снимает пометку (middleware/auth.js),
// поэтому передумать можно просто зайдя в аккаунт.
const { listAccountsDueForDeletion } = require("../data/users");
const { deleteAccount } = require("./deleteAccount");

// Раз в час: точность до часа тут более чем достаточна (речь о неделе), а чаще
// сканировать таблицу пользователей незачем.
const SWEEP_INTERVAL_MS = 60 * 60 * 1000;

async function sweepOnce() {
  const due = listAccountsDueForDeletion(new Date().toISOString());
  for (const userId of due) {
    try {
      await deleteAccount(userId);
    } catch (err) {
      console.error(`scheduled deletion of ${userId} failed:`, err);
    }
  }
}

function startAccountDeletionSweep() {
  setInterval(() => {
    sweepOnce().catch((err) => console.error("account deletion sweep failed:", err));
  }, SWEEP_INTERVAL_MS);
}

module.exports = { startAccountDeletionSweep, sweepOnce };
