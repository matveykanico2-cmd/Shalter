import { IncomingMessage, ServerResponse } from "node:http";
import type { NextFunction, Request, RequestHandler, Response } from "express";
import { loadLegacyFront } from "./legacy.js";

// Общая обработка запроса до маршрутов (server/front.js) — та же, что у старого
// приложения, и ровно один раз: запрос, дошедший потом до старого приложения, её
// пропускает. front.js — приложение Express 4, поэтому на время его работы прототипы
// req/res — голые http-объекты (как в legacy-fallback.adapter.ts), а после —
// снова Express 5 из Nest. Разобранные им cookie, тело и req.query (в разборе
// Express 4: a[b]=1 → вложенный объект, как у старых маршрутов) остаются на запросе.
export function frontMiddleware(): RequestHandler {
  const front = loadLegacyFront();
  return (req: Request, res: Response, next: NextFunction) => {
    const reqProto = Object.getPrototypeOf(req);
    const resProto = Object.getPrototypeOf(res);
    Object.setPrototypeOf(req, IncomingMessage.prototype);
    Object.setPrototypeOf(res, ServerResponse.prototype);
    front.handle(req, res, (err) => {
      Object.setPrototypeOf(req, reqProto);
      Object.setPrototypeOf(res, resProto);
      next(err);
    });
  };
}
