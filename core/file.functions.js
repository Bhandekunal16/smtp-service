const { fs, path } = require("../provider/dependency.map");

const LOG_DIR = path.join(process.cwd(), "logs");

fs.mkdirSync(LOG_DIR, { recursive: true });

let currentDate = "";
let stream = null;

function getLogStream() {
  const date = new Date().toISOString().slice(0, 10);

  if (date !== currentDate) {
    if (stream) {
      stream.end();
    }

    currentDate = date;

    stream = fs.createWriteStream(path.join(LOG_DIR, `${date}.txt`), {
      flags: "a",
    });
  }

  return stream;
}

module.exports = function append(log) {
  getLogStream().write(`${log}\n`);
};
