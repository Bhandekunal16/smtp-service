const {
  windowMs: WINDOW_MS,
  limit: MAX_REQUESTS,
  RATE_LIMIT_RESPONSE,
} = require("../provider/config.map");

const clients = new Map();

setInterval(
  () => {
    const now = Date.now();
    for (const [ip, client] of clients) {
      if (now >= client.resetAt) clients.delete(ip);
    }
  },
  Math.max(WINDOW_MS, 60_000),
).unref();

module.exports = function rateLimiter(req, res) {
  const ip = req.socket.remoteAddress;
  const now = Date.now();

  let client = clients.get(ip);

  if (client === undefined || now >= client.resetAt) {
    client = { count: 1, resetAt: now + WINDOW_MS };
    clients.set(ip, client);
  } else {
    client.count++;
  }

  const remaining = MAX_REQUESTS - client.count;

  res.setHeader("RateLimit-Limit", MAX_REQUESTS);
  res.setHeader("RateLimit-Remaining", Math.max(0, remaining));

  if (remaining < 0) {
    res.writeHead(429, {
      "Content-Type": "application/json",
      "Retry-After": Math.ceil((client.resetAt - now) / 1000),
    });

    res.end(RATE_LIMIT_RESPONSE);
    return false;
  }

  return true;
};
