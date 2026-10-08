const { helmet } = require("../provider/dependency.map");
const { helmet: HELMET } = require("../provider/config.map");

module.exports = function helmetInterceptor(app) {
  app.use(Object.keys(HELMET).length ? helmet(HELMET) : helmet());
};
