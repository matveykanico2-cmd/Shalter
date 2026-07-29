import { readCollection, updateCollection } from "./store";
import type { User } from "../types";

const FILE = "users";

export async function listUsers(): Promise<User[]> {
  return readCollection<User>(FILE);
}

export async function getUser(id: string): Promise<User | undefined> {
  const users = await listUsers();
  return users.find((u) => u.id === id);
}

export async function findUserByPhone(phone: string): Promise<User | undefined> {
  const users = await listUsers();
  return users.find((u) => u.phone === phone);
}

export async function findUserByEmail(email: string): Promise<User | undefined> {
  const users = await listUsers();
  const normalized = email.trim().toLowerCase();
  return users.find((u) => u.email?.toLowerCase() === normalized);
}

export async function createUser(user: User): Promise<User> {
  await updateCollection<User>(FILE, (users) => [...users, user]);
  return user;
}

// Atomic check-then-create, so two concurrent verify() calls for the same
// new phone number can't both see "not found" and each create a duplicate.
export async function findOrCreateUserByPhone(
  phone: string,
  makeNew: () => User
): Promise<{ user: User; isNew: boolean }> {
  let isNew = false;
  let result!: User;
  await updateCollection<User>(FILE, (users) => {
    const existing = users.find((u) => u.phone === phone);
    if (existing) {
      result = existing;
      return users;
    }
    isNew = true;
    result = makeNew();
    return [...users, result];
  });
  return { user: result, isNew };
}

export async function updateUser(id: string, patch: Partial<User>): Promise<User | undefined> {
  let updated: User | undefined;
  await updateCollection<User>(FILE, (users) =>
    users.map((u) => {
      if (u.id !== id) return u;
      updated = { ...u, ...patch };
      return updated;
    })
  );
  return updated;
}

export async function setBlocked(userId: string, targetId: string, blocked: boolean): Promise<User | undefined> {
  let updated: User | undefined;
  await updateCollection<User>(FILE, (users) =>
    users.map((u) => {
      if (u.id !== userId) return u;
      const current = new Set(u.blockedUserIds ?? []);
      if (blocked) current.add(targetId);
      else current.delete(targetId);
      updated = { ...u, blockedUserIds: [...current] };
      return updated;
    })
  );
  return updated;
}
