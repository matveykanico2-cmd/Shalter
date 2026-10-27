import { Controller, Get, Param, Req, Res } from "@nestjs/common";
import type { Request, Response } from "express";
import { ShortLinksService } from "./short-links.service.js";

// Без сессии: короткую ссылку открывают и посторонние.
@Controller()
export class ShortLinksController {
  public constructor(private readonly links: ShortLinksService) {}

  @Get("api/short-links")
  public count() {
    return this.links.count();
  }

  @Get("s/:code")
  public open(@Req() req: Request, @Param("code") code: string, @Res() res: Response): void {
    const outcome = this.links.open(code, req.get("host"));
    if (outcome.kind === "missing") {
      res.status(404).send("Ссылка не найдена");
    } else if (outcome.kind === "redirect") {
      res.redirect(302, outcome.path);
    } else {
      res.set("Referrer-Policy", "no-referrer");
      res.set("X-Robots-Tag", "noindex, nofollow");
      res.type("html").send(outcome.html);
    }
  }
}
