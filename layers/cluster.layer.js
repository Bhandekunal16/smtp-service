const { os, cluster } = require("../provider/dependency.map");

let clusterShuttingDown = false;

function markClusterShuttingDown() {
  clusterShuttingDown = true;
}

function isClusterShuttingDown() {
  return clusterShuttingDown;
}

module.exports = function clustering() {
  if (!cluster.isPrimary) return;

  const availableCPUs = os.availableParallelism
    ? os.availableParallelism()
    : os.cpus().length;

  const configuredWorkers = Number.parseInt(process.env.WORKERS, 10);

  const workerCount =
    Number.isInteger(configuredWorkers) && configuredWorkers > 0
      ? configuredWorkers
      : availableCPUs;

  for (let i = 0; i < workerCount; i++) {
    cluster.fork();
  }

  cluster.on("exit", (worker) => {
    const pid = worker.process.pid;

    if (clusterShuttingDown) {
      console.log(`Cluster primary: worker ${pid} exited`);
      return;
    }

    console.log(`Worker ${pid} died. Forking a replacement worker...`);

    cluster.fork();
  });
};

module.exports.markClusterShuttingDown = markClusterShuttingDown;
module.exports.isClusterShuttingDown = isClusterShuttingDown;
