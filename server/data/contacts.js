const db = require("../db");

function listAllContacts() {
  return db.prepare("SELECT * FROM contacts").all();
}

async function listContactsFor(ownerId) {
  return db.prepare("SELECT * FROM contacts WHERE ownerId = ?").all(ownerId);
}

async function addContact(contact) {
  db.prepare("INSERT INTO contacts (id, ownerId, userId, addedAt) VALUES (?, ?, ?, ?)").run(
    contact.id,
    contact.ownerId,
    contact.userId,
    contact.addedAt
  );
  return contact;
}

async function removeContact(ownerId, userId) {
  db.prepare("DELETE FROM contacts WHERE ownerId = ? AND userId = ?").run(ownerId, userId);
}

// Account deletion (server/lib/deleteAccount.js) — strips a user out of
// everyone else's contact list too, not just their own of others.
async function removeAllContactsInvolving(userId) {
  db.prepare("DELETE FROM contacts WHERE ownerId = ? OR userId = ?").run(userId, userId);
}

module.exports = { listAllContacts, listContactsFor, addContact, removeContact, removeAllContactsInvolving };
