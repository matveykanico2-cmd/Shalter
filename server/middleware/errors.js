// Ошибки клиента от middleware (body-parser: битый JSON, слишком большое тело, чужая
// кодировка) несут status/statusCode 4xx — отдаём его, а не 500. Текст — свой, а не
// внутренний текст исключения.
const CLIENT_ERROR_TEXT = {
  "entity.parse.failed": "invalid json",
  "entity.too.large": "Слишком большой запрос",
};

function errorHandler(err, req, res, _next) {
  const status = Number(err?.status ?? err?.statusCode);
  if (Number.isInteger(status) && status >= 400 && status < 500) {
    return res.status(status).json({ error: CLIENT_ERROR_TEXT[err.type] ?? "bad request" });
  }
  console.error(err);
  res.status(500).json({ error: "internal error" });
}

function asyncRoute(fn) {
  return (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
}

module.exports = { errorHandler, asyncRoute };
