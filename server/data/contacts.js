const db = require("../db");

function listAllContacts() {
  return db.prepare("SELECT * FROM contacts").all();
}

async function listContactsFor(ownerId) {
  return db.prepare("SELECT * FROM contacts WHERE ownerId = ?").all(ownerId);
}

async function addContact(contact) {
  // Adding someone already in the list updates the name instead of inserting a
  // duplicate row — the add form is reachable from several places and "add
  // again" should mean "correct the name", not "list them twice".
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

// Account deletion (server/lib/deleteAccount.js) — strips a user out of
// everyone else's contact list too, not just their own of others.
async function removeAllContactsInvolving(userId) {
  db.prepare("DELETE FROM contacts WHERE ownerId = ? OR userId = ?").run(userId, userId);
}

module.exports = { listAllContacts, listContactsFor, addContact, renameContact, removeContact, removeAllContactsInvolving };
