const { logByte, http } = require("../provider/dependency.map");

module.exports = function replicate(app, host, port, replicate, replicas) {
  const count = replicate
    ? Number.isInteger(replicas) && replicas > 0
      ? replicas
      : 1
    : 1;

  const servers = new Array(count);

  for (let i = 0; i < count; i++) {
    const nodePort = port + (replicate ? i : 0);
    const server = http.createServer(app);

    server.listen(nodePort, host, () => {
      logByte.info(`Backend server (http://${host}:${nodePort})`);
    });

    servers[i] = server;
  }

  return servers;
};
