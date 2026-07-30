// Central error handler: anything thrown/rejected in a route lands here as JSON,
// instead of Express's default HTML stack-trace page.
function errorHandler(err, req, res, _next) {
  console.error(err);
  res.status(500).json({ error: "internal error" });
}

// Wraps an async route handler so a rejected promise is forwarded to next()
// (Express doesn't do this automatically for async handlers).
function asyncRoute(fn) {
  return (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
}

module.exports = { errorHandler, asyncRoute };
