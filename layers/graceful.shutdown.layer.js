const { cluster, logByte } = require("../provider/dependency.map");

let [shutdownStarted, shutdownConfig, clusterShutdownStarted] = [
  false,
  null,
  false,
];

const NOOP = () => {};

function isShuttingDown() {
  return shutdownStarted;
}

function waitForActiveRequests(activeRequests, name) {
  if (!activeRequests || activeRequests.size === 0) return Promise.resolve();

  logByte.debug(`${name}: waiting for active requests`);

  return new Promise((resolve) => {
    const check = () => {
      if (activeRequests.size === 0) {
        resolve();
        return;
      }

      setImmediate(check);
    };

    check();
  });
}

function destroyActiveRequests(activeRequests, name) {
  if (!activeRequests || activeRequests.size === 0) return;

  const count = activeRequests.size;

  logByte.error(`${name}: destroying ${count} active requests`);

  for (const item of activeRequests) {
    try {
      if (item?.socket && !item.socket.destroyed) {
        item.socket.destroy();
      } else if (typeof item?.destroy === "function" && !item.destroyed) {
        item.destroy();
      }
    } catch (_) {
      // !ignore
    }
  }

  activeRequests.clear();
}

function runGracefulShutdown(signal) {
  if (shutdownStarted || !shutdownConfig) return;

  shutdownStarted = true;

  const {
    server,
    name,
    shutdownTimeout,
    activeRequests,
    onShutdown = NOOP,
  } = shutdownConfig;

  logByte.error(`${signal} received. Starting graceful shutdown...`);
  logByte.error(`${name}: stopping new requests`);

  onShutdown();

  const forceTimer = setTimeout(() => {
    logByte.error(`${name}: shutdown timeout`);

    destroyActiveRequests(activeRequests, name);

    process.exit(1);
  }, shutdownTimeout);

  forceTimer.unref?.();

  server.close((err) => {
    if (err) logByte.error(`${name}: server.close error:`, err.message);

    waitForActiveRequests(activeRequests, name).then(() => {
      clearTimeout(forceTimer);
      logByte.error(`${name}: shutdown complete`);
      process.exit(0);
    });
  });
}

function gracefulShutdown(options) {
  shutdownConfig = options;

  process.once("SIGTERM", () => runGracefulShutdown("SIGTERM"));
  process.once("SIGINT", () => runGracefulShutdown("SIGINT"));
}

function triggerGracefulShutdown(signal) {
  runGracefulShutdown(signal);
}

function registerClusterPrimaryShutdown({
  shutdownTimeout,
  markClusterShuttingDown,
}) {
  const runClusterShutdown = (signal) => {
    if (clusterShutdownStarted) {
      return;
    }

    clusterShutdownStarted = true;
    shutdownStarted = true;

    console.log(`${signal} received. Starting graceful shutdown...`);
    console.log("Cluster primary: shutting down workers");

    markClusterShuttingDown?.();

    const workers = Object.values(cluster.workers);

    if (workers.length === 0) {
      console.log("Cluster primary: shutdown complete");
      process.exit(0);
      return;
    }

    let remaining = workers.length;

    const onWorkerExit = () => {
      remaining--;

      if (remaining !== 0) {
        return;
      }

      cluster.removeListener("exit", onWorkerExit);
      clearTimeout(forceTimer);

      console.log("Cluster primary: shutdown complete");

      process.exit(0);
    };

    cluster.on("exit", onWorkerExit);

    for (const worker of workers) {
      try {
        worker.send("shutdown");
      } catch (_) {
        // !ignore
      }
    }

    const forceTimer = setTimeout(() => {
      cluster.removeListener("exit", onWorkerExit);

      console.log("Cluster primary: shutdown timeout");

      for (const worker of Object.values(cluster.workers)) {
        try {
          worker.kill();
        } catch (_) {
          // !ignore
        }
      }

      process.exit(1);
    }, shutdownTimeout);

    forceTimer.unref?.();
  };

  process.once("SIGTERM", () => runClusterShutdown("SIGTERM"));
  process.once("SIGINT", () => runClusterShutdown("SIGINT"));
}

function registerWorkerShutdownMessage(onShutdownMessage) {
  if (!cluster.isWorker) return;
  process.on("message", (message) => {
    if (message === "shutdown") onShutdownMessage();
  });
}

function resetShutdownStateForTests() {
  if (process.env.NODE_ENV !== "test") return;
  shutdownStarted = false;
  shutdownConfig = null;
  clusterShutdownStarted = false;
}

module.exports = {
  gracefulShutdown,
  triggerGracefulShutdown,
  isShuttingDown,
  registerClusterPrimaryShutdown,
  registerWorkerShutdownMessage,
  resetShutdownStateForTests,
};
