import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Req, UseGuards } from "@nestjs/common";
import type { Request } from "express";
import { ZodValidationPipe } from "../../common/pipes/zod-validation.pipe.js";
import { AuthGuard } from "../auth/guards/auth.guard.js";
import { FoldersService } from "./folders.service.js";
import { createFolderSchema, patchFolderSchema, type CreateFolderDto, type PatchFolderDto } from "./model/schemas/folder.schema.js";

// Папки чатов (/api/folders). invite/… — раньше /:id.
@Controller("api/folders")
@UseGuards(AuthGuard)
export class FoldersController {
  public constructor(private readonly folders: FoldersService) {}

  @Get()
  public list(@Req() req: Request) {
    return this.folders.list(req.uid!);
  }

  @Post()
  @HttpCode(200)
  public create(@Req() req: Request, @Body(new ZodValidationPipe(createFolderSchema)) dto: CreateFolderDto) {
    return this.folders.create(req.uid!, dto);
  }

  @Get("invite/:code")
  public preview(@Param("code") code: string) {
    return this.folders.preview(code);
  }

  @Post("invite/:code/import")
  @HttpCode(200)
  public import(@Req() req: Request, @Param("code") code: string) {
    return this.folders.import(req.uid!, code);
  }

  @Patch(":id")
  public update(@Req() req: Request, @Param("id") id: string, @Body(new ZodValidationPipe(patchFolderSchema)) dto: PatchFolderDto) {
    return this.folders.update(req.uid!, id, dto);
  }

  @Delete(":id")
  public delete(@Req() req: Request, @Param("id") id: string) {
    return this.folders.delete(req.uid!, id);
  }

  @Post(":id/invite-link")
  @HttpCode(200)
  public createInviteLink(@Req() req: Request, @Param("id") id: string) {
    return this.folders.createInviteLink(req.uid!, id);
  }

  @Delete(":id/invite-link")
  public revokeInviteLink(@Req() req: Request, @Param("id") id: string) {
    return this.folders.revokeInviteLink(req.uid!, id);
  }
}
