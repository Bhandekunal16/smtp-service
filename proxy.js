const {
  host: TARGET_HOST,
  port: TARGET_PORT,
  proxyPort,
  replicas,
  REPLICA,
  rateLimiting,
  PROXY_TIMEOUT,
  HEADERS_TIMEOUT,
  KEEP_ALIVE_TIMEOUT,
  SHUTDOWN_TIMEOUT,
  ENABLE_CLIENT_HEADERS_TIMEOUT,
  ENABLE_CLIENT_KEEP_ALIVE_TIMEOUT,
  ENABLE_UPSTREAM_REQUEST_TIMEOUT,
  ENABLE_UPSTREAM_RESPONSE_TIMEOUT,
} = require("./provider/config.map");

const { http, logByte } = require("./provider/dependency.map");
const rateLimiter = require("./layers/rate.limiting.layer");

const {
  isShuttingDown,
  gracefulShutdown,
} = require("./layers/graceful.shutdown.layer");

const proxyRequestAbortHandler = require("./proxy/proxy.request.abort.handler");

const {
  updateResponseTimeout,
  updateRequestTimeout,
} = require("./proxy/proxy.timeout.handler");

const sendBadGateway = require("./proxy/proxy.error.handler");

const createProxyRequestTracker = require("./proxy/proxy.request.tracker");

const { track, activeRequests } = createProxyRequestTracker();

const replicaCount = Number.isInteger(replicas) && replicas > 0 ? replicas : 1;

const backendPorts = REPLICA
  ? Array.from({ length: replicaCount }, (_, index) => TARGET_PORT + index)
  : [TARGET_PORT];

let currentBackendIndex = 0;

const getNextBackendPort = () => {
  const backendPort = backendPorts[currentBackendIndex];

  currentBackendIndex = (currentBackendIndex + 1) % backendPorts.length;

  return backendPort;
};

const server = http.createServer((req, res) => {
  if (isShuttingDown()) {
    if (!res.headersSent) {
      res.writeHead(503, {
        "Content-Type": "text/plain",
      });
    }

    if (!res.writableEnded) {
      res.end("Service Unavailable");
    }

    return;
  }

  if (rateLimiting && !rateLimiter(req, res)) {
    return;
  }

  const { url: path, method, headers } = req;

  const targetPort = getNextBackendPort();

  logByte.info(`Proxy -> ${TARGET_HOST}:${targetPort} | ${method} ${path}`);

  const options = {
    hostname: TARGET_HOST,
    port: targetPort,
    path,
    method,
    headers,
  };

  const proxyReq = http.request(options, (proxyRes) => {
    const { statusCode, headers: upstreamHeaders } = proxyRes;

    if (ENABLE_UPSTREAM_RESPONSE_TIMEOUT) {
      updateResponseTimeout(proxyRes, res, PROXY_TIMEOUT);
    }

    res.writeHead(statusCode, upstreamHeaders);

    proxyRes.pipe(res);
  });

  track(proxyReq);

  if (ENABLE_UPSTREAM_REQUEST_TIMEOUT) {
    updateRequestTimeout(proxyReq, res, PROXY_TIMEOUT);
  }

  sendBadGateway(proxyReq, res);

  proxyRequestAbortHandler(req, proxyReq);

  req.pipe(proxyReq);
});

if (ENABLE_CLIENT_HEADERS_TIMEOUT) {
  server.headersTimeout = HEADERS_TIMEOUT;
}

if (ENABLE_CLIENT_KEEP_ALIVE_TIMEOUT) {
  server.keepAliveTimeout = KEEP_ALIVE_TIMEOUT;
}

server.listen(proxyPort, TARGET_HOST, () => {
  logByte.info(`Proxy server (http://${TARGET_HOST}:${proxyPort})`);

  logByte.info(`Backend replicas: ${backendPorts.join(", ")}`);
});

gracefulShutdown({
  server,
  name: "Proxy",
  shutdownTimeout: SHUTDOWN_TIMEOUT,
  activeRequests,
});
