const { express, cors } = require("./provider/dependency.map");

const {
  errorInterceptor,
  encryption_Interceptor,
  logger_interceptor,
  helmet_interceptor,
  requestId,
  response_interceptor,
} = require("./provider/config.map");

const {
  errorInterceptors,
  encryptionInterceptor,
  loggerInterceptor,
  helmetInterceptor,
  requestIdInterceptor,
  responseInterceptor,
} = require("./provider/interceptor.map");

function middleware(app) {
  if (requestId) app.use(requestIdInterceptor);
  if (helmet_interceptor) helmetInterceptor(app);

  app.use(cors());
  app.use(express.json());

  if (encryption_Interceptor) app.use(encryptionInterceptor);
  if (logger_interceptor) app.use(loggerInterceptor);
  if (response_interceptor) app.use(responseInterceptor);
}

function errorMiddleware(app) {
  if (errorInterceptor) app.use(errorInterceptors);
}

module.exports = { middleware, errorMiddleware };
