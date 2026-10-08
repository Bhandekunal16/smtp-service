function sendGatewayTimeout(res) {
  if (res.writableEnded || res.destroyed) return;

  if (!res.headersSent) res.writeHead(504);
  res.end("Gateway Timeout");
}

function handleTimeout(req, res) {
  if (!req.destroyed) req.destroy();
  sendGatewayTimeout(res);
}

function updateResponseTimeout(proxyRes, res, timeout) {
  proxyRes.setTimeout(timeout, () => handleTimeout(proxyRes, res));
}

function updateRequestTimeout(proxyReq, res, timeout) {
  proxyReq.setTimeout(timeout, () => handleTimeout(proxyReq, res));
}

module.exports = {
  updateResponseTimeout,
  updateRequestTimeout,
};
