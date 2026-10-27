import { Controller, Get, UseGuards } from "@nestjs/common";
import { AuthGuard } from "../auth/guards/auth.guard.js";
import { SafetyLabelsRepository } from "./safety-labels.repository.js";

// Метки безопасности для клиента (GET /api/labels): по ним профиль показывает «СКАМ», «Фейк»…
@Controller("api/labels")
@UseGuards(AuthGuard)
export class LabelsController {
  public constructor(private readonly labels: SafetyLabelsRepository) {}

  @Get()
  public list() {
    return { labels: this.labels.list() };
  }
}
