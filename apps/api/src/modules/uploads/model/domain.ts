/** Ответ на загрузку: адрес файла и то, что клиент передал о нём в query. */
export interface UploadResult {
  url: string;
  name: string;
  size: number;
  mimeType: string | undefined;
  kind: string;
}
