const { performance } = require("../provider/dependency.map");
const { WRITE_L0G, LOG_RESPONSES } = require("../provider/config.map");
const append = require("../core/file.functions");

module.exports = function responseLogger(req, res, next) {
  if (!WRITE_L0G && !LOG_RESPONSES) {
    next();
    return;
  }

  const start = performance.now();

  res.once("finish", () => {
    const response = {
      requestId: req.requestId || req.headers["x-request-id"] || "N/A",
      method: req.method,
      originalUrl: req.originalUrl,
      statusCode: res.statusCode,
      durationMs: Math.round((performance.now() - start) * 100) / 100,
      contentLength: res.getHeader("content-length") || 0,
    };

    const output = JSON.stringify(response);

    if (WRITE_L0G) append(output);
    if (LOG_RESPONSES) console.log(`response: ${output}`);
  });

  next();
};
