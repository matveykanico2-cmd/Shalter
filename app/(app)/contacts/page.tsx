import { getCurrentUserId } from "@/lib/auth";
import { listContactsFor } from "@/lib/data/contacts";
import { listUsers } from "@/lib/data/users";
import { publicUser, publicUsers } from "@/lib/data/sanitize";
import { ContactsView } from "@/components/ContactsView";

export default async function ContactsPage() {
  const uid = await getCurrentUserId();
  const [contacts, users] = await Promise.all([listContactsFor(uid ?? ""), listUsers()]);
  const resolved = contacts
    .map((c) => {
      const user = users.find((u) => u.id === c.userId);
      return user ? { ...c, user: publicUser(user) } : null;
    })
    .filter((c) => c !== null);
  const nonContacts = users.filter(
    (u) => u.id !== uid && !u.isBot && !contacts.some((c) => c.userId === u.id)
  );

  return <ContactsView initialContacts={resolved} candidateUsers={publicUsers(nonContacts)} />;
}
