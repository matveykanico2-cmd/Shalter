// Поля, которые ставит обработка запроса: uid — guard входа (как requireUserId в server/).
declare global {
  namespace Express {
    interface Request {
      uid?: string;
    }
  }
}

export {};
