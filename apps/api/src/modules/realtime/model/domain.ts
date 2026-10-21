import type { WebSocket } from "ws";

/** Сокет вошедшего: чей он, с какого устройства и ответил ли на последний пинг. */
export interface ClientSocket extends WebSocket {
  uid: string;
  deviceId: string | null;
  isAlive: boolean;
}

/** Событие для клиента: { type, … }; chatId или chat.id — чат, к которому оно относится. */
export type WsEvent = { type: string; [key: string]: unknown };

/** Сколько пользователей в сети и сколько у них сокетов (статистика сервера в админке). */
export interface WsStats {
  onlineUsers: number;
  sockets: number;
}
