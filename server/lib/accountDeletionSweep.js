const { listAccountsDueForDeletion } = require("../data/users");
const { deleteAccount } = require("./deleteAccount");

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
