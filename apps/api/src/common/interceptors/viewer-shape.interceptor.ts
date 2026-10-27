import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from "@nestjs/common";
import type { Request } from "express";
import { map } from "rxjs";
import { shapeBodyForViewer } from "../../legacy/legacy.js";

// Подписчиков канала в ответах видят только его админы — как обёртка res.json в server/app.js.
@Injectable()
export class ViewerShapeInterceptor implements NestInterceptor {
  public intercept(context: ExecutionContext, next: CallHandler) {
    const req = context.switchToHttp().getRequest<Request>();
    return next.handle().pipe(map((body) => shapeBodyForViewer(body, req.uid)));
  }
}
