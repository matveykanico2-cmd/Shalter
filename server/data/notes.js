// Backing store for /note (server/lib/helperBot/utility.js) — a personal
// scratch list, per user, unrelated to any chat.
const db = require("../db");

function addNote(userId, text) {
  const id = `note_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
  db.prepare("INSERT INTO notes (id, userId, text, createdAt) VALUES (?, ?, ?, ?)").run(
    id,
    userId,
    text,
    new Date().toISOString()
  );
  return id;
}

function listNotes(userId) {
  return db.prepare("SELECT * FROM notes WHERE userId = ? ORDER BY createdAt ASC").all(userId);
}

// 1-based index into that user's own list, as shown by /note list — not the
// underlying row id, which nobody typing a chat command would know.
function deleteNoteByIndex(userId, index) {
  const notes = listNotes(userId);
  const target = notes[index - 1];
  if (!target) return false;
  db.prepare("DELETE FROM notes WHERE id = ?").run(target.id);
  return true;
}

module.exports = { addNote, listNotes, deleteNoteByIndex };
