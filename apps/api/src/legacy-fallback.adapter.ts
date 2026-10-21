import { IncomingMessage, ServerResponse } from "node:http";
import { ExpressAdapter } from "@nestjs/platform-express";
import type { NextFunction, Request, RequestHandler, Response } from "express";

// Всё, на что у Nest нет своего маршрута, уходит в старое Express-приложение —
// вместо 404 от Nest. Старое приложение само отвечает 404 (JSON на /api, SPA на
// остальное), так что запрос дальше не идёт. Модули переносятся в Nest по одному:
// его маршруты стоят раньше и забирают свои пути, остальное по-прежнему обслуживает server/.
export class LegacyFallbackAdapter extends ExpressAdapter {
  constructor(private readonly legacy: RequestHandler) {
    super();
  }

  override setNotFoundHandler(...args: Parameters<ExpressAdapter["setNotFoundHandler"]>) {
    // Обёртка, а не само приложение: увидев подприложение Express, Express 5 из Nest
    // подставил бы ему свои прототипы req/res, и старый код работал бы на чужих
    // res.json/res.sendFile. Прототипы возвращаются к голым http-объектам, и старое
    // приложение получает запрос таким, каким его видел server/index.js, — со своим
    // Express 4 (иначе его разбор query пропускал бы запрос: геттер req.query Express 5
    // пропадает вместе с прототипом, и req.query оставался пустым).
    this.use((req: Request, res: Response, next: NextFunction) => {
      Object.setPrototypeOf(req, IncomingMessage.prototype);
      Object.setPrototypeOf(res, ServerResponse.prototype);
      this.legacy(req, res, next);
    });
    return super.setNotFoundHandler(...args);
  }
}
