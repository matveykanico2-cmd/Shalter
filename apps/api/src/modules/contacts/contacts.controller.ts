import { Body, Controller, Delete, Get, HttpCode, Post, Req, UseGuards } from "@nestjs/common";
import type { Request } from "express";
import { ZodValidationPipe } from "../../common/pipes/zod-validation.pipe.js";
import { AuthGuard } from "../auth/guards/auth.guard.js";
import { ContactsService } from "./contacts.service.js";
import {
  addContactSchema,
  contactNoteSchema,
  matchContactsSchema,
  removeContactSchema,
  renameContactSchema,
  type AddContactDto,
  type ContactNoteDto,
  type MatchContactsDto,
  type RemoveContactDto,
  type RenameContactDto,
} from "./model/schemas/contact.schema.js";

// Контакты (/api/contacts).
@Controller("api/contacts")
@UseGuards(AuthGuard)
export class ContactsController {
  public constructor(private readonly contacts: ContactsService) {}

  @Get()
  public list(@Req() req: Request) {
    return this.contacts.list(req.uid!);
  }

  @Get("ids")
  public ids(@Req() req: Request) {
    return this.contacts.ids(req.uid!);
  }

  @Post()
  @HttpCode(200)
  public add(@Req() req: Request, @Body(new ZodValidationPipe(addContactSchema)) dto: AddContactDto) {
    return this.contacts.add(req.uid!, dto);
  }

  @Post("note")
  @HttpCode(200)
  public setNote(@Req() req: Request, @Body(new ZodValidationPipe(contactNoteSchema)) dto: ContactNoteDto) {
    return this.contacts.setNote(req.uid!, dto);
  }

  @Post("rename")
  @HttpCode(200)
  public rename(@Req() req: Request, @Body(new ZodValidationPipe(renameContactSchema)) dto: RenameContactDto) {
    return this.contacts.rename(req.uid!, dto);
  }

  @Delete()
  public remove(@Req() req: Request, @Body(new ZodValidationPipe(removeContactSchema)) dto: RemoveContactDto) {
    return this.contacts.remove(req.uid!, dto);
  }

  @Post("match")
  @HttpCode(200)
  public match(@Req() req: Request, @Body(new ZodValidationPipe(matchContactsSchema)) dto: MatchContactsDto) {
    return this.contacts.match(req.uid!, dto);
  }
}
