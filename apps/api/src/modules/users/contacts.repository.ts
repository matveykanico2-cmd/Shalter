import { Injectable } from "@nestjs/common";
import { and, eq } from "drizzle-orm";
import { InjectDb, type Db } from "../db/db.module.js";
import { contacts } from "../db/schema.js";
import type { ContactRow } from "./model/domain.js";

export interface NewContact {
  id: string;
  ownerId: string;
  userId: string;
  addedAt: string;
  localName: string | null;
}

// Контакты — то же, что server/data/contacts.js, на той же таблице.
@Injectable()
export class ContactsRepository {
  public constructor(@InjectDb() private readonly db: Db) {}

  public findForOwner(ownerId: string): ContactRow[] {
    return this.db.select().from(contacts).where(eq(contacts.ownerId, ownerId)).all();
  }

  /** Id тех, кто у пользователя в контактах. */
  public contactIdsOf(ownerId: string): Set<string> {
    return new Set(this.findForOwner(ownerId).map((c) => c.userId));
  }

  /** Кто держит пользователя у себя в контактах. */
  public listOwnersOf(userId: string): string[] {
    return this.db.select({ ownerId: contacts.ownerId }).from(contacts).where(eq(contacts.userId, userId)).all().map((r) => r.ownerId);
  }

  /**
   * Новый контакт — как прислали (без note). Уже есть — строка из базы; присланное
   * localName (не null) её переименовывает, пустое — стирает.
   */
  public add(contact: NewContact): NewContact | ContactRow {
    const existing = this.db
      .select({ id: contacts.id })
      .from(contacts)
      .where(and(eq(contacts.ownerId, contact.ownerId), eq(contacts.userId, contact.userId)))
      .get();
    if (existing) {
      if (contact.localName != null) {
        this.db.update(contacts).set({ localName: contact.localName || null }).where(eq(contacts.id, existing.id)).run();
      }
      return this.db.select().from(contacts).where(eq(contacts.id, existing.id)).get()!;
    }
    this.db.insert(contacts).values({ ...contact, localName: contact.localName || null }).run();
    return contact;
  }

  public rename(ownerId: string, userId: string, localName: string | null): ContactRow | undefined {
    const where = and(eq(contacts.ownerId, ownerId), eq(contacts.userId, userId));
    this.db.update(contacts).set({ localName: localName || null }).where(where).run();
    return this.db.select().from(contacts).where(where).get();
  }

  /** false — такого контакта нет. */
  public setNote(ownerId: string, userId: string, sealedNote: string | null): boolean {
    return this.db.update(contacts).set({ note: sealedNote }).where(and(eq(contacts.ownerId, ownerId), eq(contacts.userId, userId))).run().changes > 0;
  }

  public remove(ownerId: string, userId: string): void {
    this.db.delete(contacts).where(and(eq(contacts.ownerId, ownerId), eq(contacts.userId, userId))).run();
  }
}
