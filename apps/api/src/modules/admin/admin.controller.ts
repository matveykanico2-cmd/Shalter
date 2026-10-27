import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Put, Query, Req, Res, UseGuards } from "@nestjs/common";
import type { Request, Response } from "express";
import { ZodValidationPipe } from "../../common/pipes/zod-validation.pipe.js";
import { serveUpload } from "../../legacy/legacy.js";
import { AuthGuard } from "../auth/guards/auth.guard.js";
import { AdminAccessService } from "./admin-access.service.js";
import { AdminCatalogService } from "./admin-catalog.service.js";
import { AdminLegalService } from "./admin-legal.service.js";
import { AdminModerationService } from "./admin-moderation.service.js";
import { AdminServerService } from "./admin-server.service.js";
import {
  banSchema,
  bulkDeleteSchema,
  deleteUserSchema,
  developerSchema,
  directoryQuerySchema,
  exportSchema,
  labelUserSchema,
  legalLookupQuerySchema,
  chatLookupQuerySchema,
  pricingSchema,
  reasonSchema,
  resetPasswordSchema,
  updateLabelSchema,
  createLabelSchema,
  sectionsSchema,
  statusItemSchema,
  verifySchema,
  type BanDto,
  type BulkDeleteDto,
  type DeleteUserDto,
  type DeveloperDto,
  type DirectoryQuery,
  type ExportDto,
  type LabelUserDto,
  type LegalLookupQuery,
  type ChatLookupQuery,
  type PricingDto,
  type ReasonDto,
  type ResetPasswordDto,
  type CreateLabelDto,
  type UpdateLabelDto,
  type SectionsDto,
  type StatusItemDto,
  type VerifyDto,
} from "./model/schemas/admin.schema.js";

@Controller("api/admin")
@UseGuards(AuthGuard)
export class AdminController {
  public constructor(
    private readonly access: AdminAccessService,
    private readonly legal: AdminLegalService,
    private readonly moderation: AdminModerationService,
    private readonly catalog: AdminCatalogService,
    private readonly server: AdminServerService,
  ) {}

  @Get("lookup")
  public lookup(@Req() req: Request, @Query(new ZodValidationPipe(legalLookupQuerySchema)) query: LegalLookupQuery) {
    return this.legal.lookup(req.uid!, query);
  }

  @Get("chats/lookup")
  public lookupChat(@Req() req: Request, @Query(new ZodValidationPipe(chatLookupQuerySchema)) query: ChatLookupQuery) {
    return this.moderation.lookupChat(req.uid!, query);
  }

  @Post("export")
  @HttpCode(200)
  public export(@Req() req: Request, @Body(new ZodValidationPipe(exportSchema)) dto: ExportDto) {
    return this.legal.export(req.uid!, dto);
  }

  /**
   * Вложения выгружаемого пользователя для юридического отдела — в обход проверки членства в
   * чате (выгрузка по закону требует всех медиа). Отдаёт serveUpload: расшифровка и Range.
   */
  @Get("export/media/:filename")
  public exportMedia(@Req() req: Request, @Res() res: Response, @Param("filename") filename: string) {
    this.access.require(req.uid!, "legal");
    const files = serveUpload();
    if (!files.FILENAME_RE.test(filename ?? "")) return res.status(404).end();
    return files.serveUpload()(req, res, () => {});
  }

  @Get("exports")
  public exports(@Req() req: Request) {
    return this.legal.list(req.uid!);
  }

  @Get("moderation")
  public overview(@Req() req: Request) {
    return this.moderation.overview(req.uid!);
  }

  @Get("users/:id/reports")
  public userReports(@Req() req: Request, @Param("id") id: string) {
    return this.moderation.userReports(req.uid!, id);
  }

  @Post("users/:id/ban")
  @HttpCode(200)
  public ban(@Req() req: Request, @Param("id") id: string, @Body(new ZodValidationPipe(banSchema)) dto: BanDto) {
    return this.moderation.ban(req.uid!, id, dto);
  }

  @Post("users/:id/label")
  @HttpCode(200)
  public label(@Req() req: Request, @Param("id") id: string, @Body(new ZodValidationPipe(labelUserSchema)) dto: LabelUserDto) {
    return this.moderation.setLabel(req.uid!, id, dto);
  }

  @Post("users/:id/verify")
  @HttpCode(200)
  public verifyUser(@Req() req: Request, @Param("id") id: string, @Body(new ZodValidationPipe(verifySchema)) dto: VerifyDto) {
    return this.moderation.verifyUser(req.uid!, id, dto);
  }

  @Post("users/:id/developer")
  @HttpCode(200)
  public developer(@Req() req: Request, @Param("id") id: string, @Body(new ZodValidationPipe(developerSchema)) dto: DeveloperDto) {
    return this.moderation.setDeveloper(req.uid!, id, dto);
  }

  @Delete("bots/:userId")
  public deleteBot(@Req() req: Request, @Param("userId") userId: string, @Body(new ZodValidationPipe(reasonSchema)) dto: ReasonDto) {
    return this.moderation.deleteBot(req.uid!, userId, dto);
  }

  @Post("moderation/delete")
  @HttpCode(200)
  public bulkDelete(@Req() req: Request, @Body(new ZodValidationPipe(bulkDeleteSchema)) dto: BulkDeleteDto) {
    return this.moderation.bulkDelete(req.uid!, dto);
  }

  @Post("chats/:id/verify")
  @HttpCode(200)
  public verifyChat(@Req() req: Request, @Param("id") id: string, @Body(new ZodValidationPipe(verifySchema)) dto: VerifyDto) {
    return this.moderation.verifyChat(req.uid!, id, dto);
  }

  @Delete("users/:id")
  public deleteUser(@Req() req: Request, @Param("id") id: string, @Body(new ZodValidationPipe(deleteUserSchema)) dto: DeleteUserDto) {
    return this.moderation.deleteUser(req.uid!, id, dto);
  }

  @Post("users/:id/reset-password")
  @HttpCode(200)
  public resetPassword(@Req() req: Request, @Param("id") id: string, @Body(new ZodValidationPipe(resetPasswordSchema)) dto: ResetPasswordDto) {
    return this.moderation.resetPassword(req.uid!, id, dto);
  }

  @Get("mail-status")
  public mailStatus(@Req() req: Request) {
    return this.server.mailStatus(req.uid!);
  }

  @Get("labels")
  public listLabels(@Req() req: Request) {
    return this.catalog.listLabels(req.uid!);
  }

  @Post("labels")
  @HttpCode(200)
  public createLabel(@Req() req: Request, @Body(new ZodValidationPipe(createLabelSchema)) dto: CreateLabelDto) {
    return this.catalog.createLabel(req.uid!, dto);
  }

  @Patch("labels/:id")
  public updateLabel(@Req() req: Request, @Param("id") id: string, @Body(new ZodValidationPipe(updateLabelSchema)) dto: UpdateLabelDto) {
    return this.catalog.updateLabel(req.uid!, id, dto);
  }

  @Delete("labels/:id")
  public deleteLabel(@Req() req: Request, @Param("id") id: string) {
    return this.catalog.deleteLabel(req.uid!, id);
  }

  @Post("status-catalog")
  @HttpCode(200)
  public createStatus(@Req() req: Request, @Body(new ZodValidationPipe(statusItemSchema)) dto: StatusItemDto) {
    return this.catalog.createStatus(req.uid!, dto);
  }

  @Delete("status-catalog/:id")
  public deleteStatus(@Req() req: Request, @Param("id") id: string) {
    return this.catalog.deleteStatus(req.uid!, id);
  }

  @Get("server")
  public serverStats(@Req() req: Request) {
    return this.server.server(req.uid!);
  }

  @Get("pricing")
  public getPricing(@Req() req: Request) {
    return this.server.getPricing(req.uid!);
  }

  @Put("pricing")
  public updatePricing(@Req() req: Request, @Body(new ZodValidationPipe(pricingSchema)) dto: PricingDto) {
    return this.server.updatePricing(req.uid!, dto);
  }

  @Delete("pricing")
  public resetPricing(@Req() req: Request) {
    return this.server.resetPricing(req.uid!);
  }

  @Post("users/:id/admin-sections")
  @HttpCode(200)
  public setSections(@Req() req: Request, @Param("id") id: string, @Body(new ZodValidationPipe(sectionsSchema)) dto: SectionsDto) {
    return this.server.setSections(req.uid!, id, dto);
  }

  @Get("directory")
  public directory(@Req() req: Request, @Query(new ZodValidationPipe(directoryQuerySchema)) query: DirectoryQuery) {
    return this.moderation.directory(req.uid!, query);
  }
}
