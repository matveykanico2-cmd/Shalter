import type { PublicUser, User } from "../types";

export function publicUser(user: User): PublicUser {
  const rest = { ...user };
  delete rest.passwordHash;
  delete rest.passwordSalt;
  return rest;
}

export function publicUsers(users: User[]): PublicUser[] {
  return users.map(publicUser);
}
