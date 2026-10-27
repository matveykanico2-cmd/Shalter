import type { contactListItem, matchResult } from "@shalter/shared/schemas/contacts";
import type { blockBody, byUsernameBody } from "@shalter/shared/schemas/users";
import { queryOptions } from "@tanstack/react-query";
import type { z } from "zod";

import { userQueries } from "@/entities/user";

import { http } from "@/shared/api";

export type ContactItem = z.infer<typeof contactListItem>;
export type MatchResult = z.infer<typeof matchResult>;
export type MatchFound = MatchResult["found"][number];
export type FoundUser = z.infer<typeof byUsernameBody>["user"];
/** Номер из телефонной книги, файла или вставленного списка. */
export type PhoneEntry = { name: string; phone: string };

export const contactsQueries = {
  /**
   * Контакты целиком — с «своим» именем (GET /api/contacts). Ключ под userQueries.contacts(),
   * чтобы одна инвалидация обновляла и списки выбора людей.
   */
  list: () =>
    queryOptions({
      queryKey: [...userQueries.contacts().queryKey, "full"],
      queryFn: async ({ signal }) => (await http.get<{ contacts: ContactItem[] }>("/api/contacts", signal)).contacts,
    }),
};

export const addContact = (userId: string, localName: string | null) => http.post<unknown>("/api/contacts", { userId, localName, sharePhone: false });

export const renameContact = (userId: string, localName: string) => http.post<unknown>("/api/contacts/rename", { userId, localName });

export const removeContact = (userId: string) => http.delete<unknown>("/api/contacts", { userId });

export const matchContacts = (contacts: PhoneEntry[]) => http.post<MatchResult>("/api/contacts/match", { contacts });

export const findUserByUsername = (name: string) => http.get<z.infer<typeof byUsernameBody>>(`/api/users/by-username/${encodeURIComponent(name.replace(/^@/, ""))}`);

export const setUserBlocked = (userId: string, blocked: boolean) => http.post<z.infer<typeof blockBody>>(`/api/users/${encodeURIComponent(userId)}/block`, { blocked });
