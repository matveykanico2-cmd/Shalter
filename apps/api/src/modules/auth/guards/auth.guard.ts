import { CanActivate, ExecutionContext, Injectable } from "@nestjs/common";
import type { Request } from "express";
import { AuthService } from "../auth.service.js";

// Маршрут только для вошедших: req.uid — id пользователя, иначе 401/403 (AuthService.authenticate).
@Injectable()
export class AuthGuard implements CanActivate {
  public constructor(private readonly authService: AuthService) {}

  public canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<Request>();
    req.uid = this.authService.authenticate(req);
    return true;
  }
}
