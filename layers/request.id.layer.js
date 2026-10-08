const { randomUUID } = require("../provider/dependency.map");

module.exports = function requestId(req, res, next) {
  const requestId = req.headers["x-request-id"] || randomUUID();
  req.requestId = requestId;
  res.setHeader("X-Request-ID", requestId);
  next();
};
