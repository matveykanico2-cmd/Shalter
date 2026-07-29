import { readCollection, updateCollection } from "./store";
import type { Contact } from "../types";

const FILE = "contacts";

export async function listAllContacts(): Promise<Contact[]> {
  return readCollection<Contact>(FILE);
}

export async function listContactsFor(ownerId: string): Promise<Contact[]> {
  const contacts = await listAllContacts();
  return contacts.filter((c) => c.ownerId === ownerId);
}

export async function addContact(contact: Contact): Promise<Contact> {
  await updateCollection<Contact>(FILE, (contacts) => [...contacts, contact]);
  return contact;
}

export async function removeContact(ownerId: string, userId: string): Promise<void> {
  await updateCollection<Contact>(FILE, (contacts) =>
    contacts.filter((c) => !(c.ownerId === ownerId && c.userId === userId))
  );
}
