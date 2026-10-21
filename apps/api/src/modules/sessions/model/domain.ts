import type { sessions } from "../../db/schema.js";

export type Session = typeof sessions.$inferSelect;

// Сеанс в ответе API: настоящий device_id — секрет входа, вместо него id записи
// (клиент по старой памяти называет его deviceId).
export type SessionEntity = Omit<Session, "deviceId"> & { deviceId: string; current: boolean };
