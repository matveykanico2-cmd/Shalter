const db = require("../db");
const { encryptText, decryptText } = require("../lib/textCrypto");

const aad = (id) => `note:${id}`;

function addNote(userId, text) {
  const id = `note_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
  db.prepare("INSERT INTO notes (id, userId, text, createdAt) VALUES (?, ?, ?, ?)").run(
    id,
    userId,
    encryptText(aad(id), text),
    new Date().toISOString()
  );
  return id;
}

function listNotes(userId) {
  return db
    .prepare("SELECT * FROM notes WHERE userId = ? ORDER BY createdAt ASC")
    .all(userId)
    .map((n) => ({ ...n, text: decryptText(aad(n.id), n.text) }));
}

function deleteNoteByIndex(userId, index) {
  const notes = listNotes(userId);
  const target = notes[index - 1];
  if (!target) return false;
  db.prepare("DELETE FROM notes WHERE id = ?").run(target.id);
  return true;
}

module.exports = { addNote, listNotes, deleteNoteByIndex };
