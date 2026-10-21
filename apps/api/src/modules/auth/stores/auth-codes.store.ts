import { Injectable } from "@nestjs/common";
import { OneTimeCodes } from "./one-time-codes.store.js";

// Все одноразовые коды входа. Один экземпляр на процесс (провайдер Nest — синглтон).
@Injectable()
export class AuthCodesStore {
  /** Код в чат «Shalter»: вход по номеру, второй шаг «код в чат», смена пароля по номеру. 5 минут. */
  public readonly chat = new OneTimeCodes(5 * 60 * 1000);
  /** Подтверждение нового адреса почты, код в письме на него. 15 минут. */
  public readonly emailChange = new OneTimeCodes<string>(15 * 60 * 1000);
  /** Восстановление по паре «почта + телефон», код в письме на адрес аккаунта. 15 минут. */
  public readonly pairRecovery = new OneTimeCodes(15 * 60 * 1000, 5, true);
}
