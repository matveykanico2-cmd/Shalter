import { Injectable } from "@nestjs/common";
import { InjectDb, type Db } from "../db/db.module.js";
import { uploadUploaders } from "../db/schema.js";

// Кто загрузил файл — как recordUploader в server/lib/uploadAccess.js. Пока файл ни к
// чему не прикреплён, скачать его может только загрузивший.
@Injectable()
export class UploadsRepository {
  public constructor(@InjectDb() private readonly db: Db) {}

  public recordUploader(filename: string, userId: string): void {
    this.db.insert(uploadUploaders).values({ filename, userId, createdAt: new Date().toISOString() }).onConflictDoNothing().run();
  }
}
