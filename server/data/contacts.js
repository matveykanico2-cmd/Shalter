const { readCollection, updateCollection } = require("./store");

const FILE = "contacts";

function listAllContacts() {
  return readCollection(FILE);
}

async function listContactsFor(ownerId) {
  const contacts = await listAllContacts();
  return contacts.filter((c) => c.ownerId === ownerId);
}

async function addContact(contact) {
  await updateCollection(FILE, (contacts) => [...contacts, contact]);
  return contact;
}

async function removeContact(ownerId, userId) {
  await updateCollection(FILE, (contacts) =>
    contacts.filter((c) => !(c.ownerId === ownerId && c.userId === userId))
  );
}

module.exports = { listAllContacts, listContactsFor, addContact, removeContact };
