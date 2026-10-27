/** Обход по таймеру, перенесённый из server/lib/*Sweep.js. */
export interface Sweep {
  /** Имя, как в SWEEPS server/lib/sweeps.js. */
  readonly name: string;
  readonly intervalMs: number;
  /** Первый проход сразу при запуске (дни рождения, праздники). */
  readonly runAtStart?: boolean;
  /** Первый проход через столько, потом по intervalMs (уборка файлов). */
  readonly firstDelayMs?: number;
  /** Текст ошибки прохода в логе, как у старого обхода. */
  readonly failMessage: string;
  /** В лог — только текст ошибки, без стека (уборка файлов). */
  readonly logErrorMessageOnly?: boolean;
  /** Не запускать по таймеру: причина пишется в лог (уборка файлов на S3). */
  disabledReason?(): string | null;
  /** Один проход; now — момент, от которого считаются сроки. */
  once(now: Date): Promise<void> | void;
}
