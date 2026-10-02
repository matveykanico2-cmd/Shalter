function errorHandler(err, req, res, _next) {
  console.error(err);
  res.status(500).json({ error: "internal error" });
}

function asyncRoute(fn) {
  return (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
}

module.exports = { errorHandler, asyncRoute };
