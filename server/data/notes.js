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

function deleteNoteByIndex(userId, index) {
  const notes = listNotes(userId);
  const target = notes[index - 1];
  if (!target) return false;
  db.prepare("DELETE FROM notes WHERE id = ?").run(target.id);
  return true;
}

module.exports = { addNote, listNotes, deleteNoteByIndex };
