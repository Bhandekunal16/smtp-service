module.exports = function sendBadGateway(proxyReq, res) {
  proxyReq.once("error", () => {
    if (res.headersSent || res.writableEnded) return;
    res.writeHead(502);
    res.end("Bad Gateway");
  });
};
