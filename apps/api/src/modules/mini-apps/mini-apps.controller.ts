import { Controller, Get, Param, Res } from "@nestjs/common";
import type { Response } from "express";
import { MINI_APP_CSP } from "./lib/mini-app-page.js";
import { MiniAppsService } from "./mini-apps.service.js";

// Без сессии: страницу открывает iframe клиента, сам код бота живёт в песочнице.
@Controller("app")
export class MiniAppsController {
  public constructor(private readonly apps: MiniAppsService) {}

  @Get(":username")
  public open(@Param("username") username: string, @Res() res: Response): void {
    const html = this.apps.page(username || "");
    if (html == null) {
      res.status(404).type("text/plain; charset=utf-8").send("Приложение не найдено");
      return;
    }
    res.removeHeader("X-Frame-Options");
    res.set({ "Content-Security-Policy": MINI_APP_CSP, "X-Content-Type-Options": "nosniff", "Cache-Control": "no-store" });
    res.type("text/html; charset=utf-8").send(html);
  }
}
