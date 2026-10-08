module.exports = function error(err, _req, res, _next) {
  const statusCode = err?.status >= 400 && err.status < 600 ? err.status : 500;

  res.status(statusCode).json({
    message: err?.message || "Internal Server Error",
    status: false,
    statusCode,
  });
};
