const db = require("../db");
const { encryptText, decryptText } = require("../lib/textCrypto");

// Личная заметка о контакте (видит только владелец) — зашифрована, как и
// переписка.
const noteAad = (ownerId, userId) => `cnote:${ownerId}:${userId}`;

function contactNote(row) {
  return row?.note ? decryptText(noteAad(row.ownerId, row.userId), row.note) : null;
}

async function setContactNote(ownerId, userId, note) {
  const value = note ? encryptText(noteAad(ownerId, userId), note) : null;
  const r = db.prepare("UPDATE contacts SET note = ? WHERE ownerId = ? AND userId = ?").run(value, ownerId, userId);
  return r.changes > 0;
}

function listAllContacts() {
  return db.prepare("SELECT * FROM contacts").all();
}

async function listContactsFor(ownerId) {
  return db.prepare("SELECT * FROM contacts WHERE ownerId = ?").all(ownerId);
}

function listOwnersOf(userId) {
  return db.prepare("SELECT ownerId FROM contacts WHERE userId = ?").all(userId).map((r) => r.ownerId);
}

async function addContact(contact) {
  const existing = db.prepare("SELECT id FROM contacts WHERE ownerId = ? AND userId = ?").get(contact.ownerId, contact.userId);
  if (existing) {
    if (contact.localName != null) {
      db.prepare("UPDATE contacts SET localName = ? WHERE id = ?").run(contact.localName || null, existing.id);
    }
    return db.prepare("SELECT * FROM contacts WHERE id = ?").get(existing.id);
  }
  db.prepare("INSERT INTO contacts (id, ownerId, userId, addedAt, localName) VALUES (?, ?, ?, ?, ?)").run(
    contact.id,
    contact.ownerId,
    contact.userId,
    contact.addedAt,
    contact.localName || null
  );
  return contact;
}

async function renameContact(ownerId, userId, localName) {
  db.prepare("UPDATE contacts SET localName = ? WHERE ownerId = ? AND userId = ?").run(localName || null, ownerId, userId);
  return db.prepare("SELECT * FROM contacts WHERE ownerId = ? AND userId = ?").get(ownerId, userId);
}

async function removeContact(ownerId, userId) {
  db.prepare("DELETE FROM contacts WHERE ownerId = ? AND userId = ?").run(ownerId, userId);
}

async function removeAllContactsInvolving(userId) {
  db.prepare("DELETE FROM contacts WHERE ownerId = ? OR userId = ?").run(userId, userId);
}

module.exports = { contactNote, setContactNote, listAllContacts, listContactsFor, listOwnersOf, addContact, renameContact, removeContact, removeAllContactsInvolving };
