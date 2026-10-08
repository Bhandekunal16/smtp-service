module.exports = function proxyRequestAbortHandler(req, proxyReq) {
  const abortProxy = () => {
    if (!proxyReq.destroyed) proxyReq.destroy();
  };

  req.once("aborted", abortProxy);
  req.once("error", abortProxy);

  req.once("close", () => {
    if (!req.complete && !proxyReq.destroyed) {
      proxyReq.destroy();
    }
  });
};
