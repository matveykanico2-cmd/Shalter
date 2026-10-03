const { getChat } = require("../data/chats");
const { getUser } = require("../data/users");
const { listDue, listWhenOnline, deleteScheduled, reschedule, nextOccurrence } = require("../data/scheduledMessages");

const SWEEP_INTERVAL_MS = 20_000;

async function sweepOnce() {
  await deliverAll(listDue(new Date().toISOString()));
  await sendWhenOnline();
}

// «Когда будет в сети»: отправляем, если собеседник сейчас онлайн. Вызывается
// и проходом по таймеру, и сразу при входе пользователя в сеть (ws.js).
async function sendWhenOnline() {
  const ready = [];
  for (const scheduled of listWhenOnline()) {
    const chat = await getChat(scheduled.chatId);
    const otherId = chat?.memberIds.find((id) => id !== scheduled.senderId);
    if (!chat || !otherId || (await getUser(otherId))?.online) ready.push(scheduled);
  }
  await deliverAll(ready);
}

let delivering = Promise.resolve();
function deliverAll(list) {
  // Таймер и вход в сеть могут совпасть — без очереди сообщение ушло бы дважды.
  delivering = delivering.then(() => deliverList(list)).catch((err) => console.error("scheduled delivery failed:", err));
  return delivering;
}

async function deliverList(list) {
  if (!list.length) return;
  const { deliverMessage, sendGate } = require("../routes/messages");
  const { getScheduled } = require("../data/scheduledMessages");

  for (const listed of list) {
    const scheduled = await getScheduled(listed.id);
    // Уже отправлено или перенесено (повтор) другим проходом.
    if (!scheduled || scheduled.sendAt !== listed.sendAt) continue;
    let gone = false;
    try {
      const chat = await getChat(scheduled.chatId);
      const body = { text: scheduled.text, attachments: scheduled.attachments, replyToId: scheduled.replyToId, topicId: scheduled.topicId };
      if (chat && chat.memberIds.includes(scheduled.senderId)) {
        // Права могли измениться с момента планирования (сняли админку, заблокировали).
        const gate = await sendGate(chat, scheduled.senderId, body, { skipSlowMode: true });
        if (gate.status) console.warn(`scheduled message ${scheduled.id} dropped: ${gate.payload?.error}`);
        else await deliverMessage(chat, scheduled.senderId, body, { paidStars: gate.charged });
      } else {
        gone = true;
      }
    } catch (err) {
      console.error(`scheduled message ${scheduled.id} failed to send:`, err);
    } finally {
      const next = scheduled.repeat && !gone ? nextOccurrence(scheduled.sendAt, scheduled.repeat) : null;
      if (next) reschedule(scheduled.id, next);
      else await deleteScheduled(scheduled.id);
    }
  }
}

function startScheduledMessagesSweep() {
  setInterval(() => {
    sweepOnce().catch((err) => console.error("scheduled-messages sweep failed:", err));
  }, SWEEP_INTERVAL_MS);
}

module.exports = { startScheduledMessagesSweep, sweepOnce, sendWhenOnline };
