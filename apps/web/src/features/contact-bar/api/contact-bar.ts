import { http } from "@/shared/api";

/** Записать в контакты под своим именем и, если согласились, открыть ему свой номер. */
export const addContact = (userId: string, localName: string | null, sharePhone: boolean) => http.post<unknown>("/api/contacts", { userId, localName, sharePhone });
