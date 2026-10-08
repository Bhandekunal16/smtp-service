# SMTP Service

A CommonJS Node.js service that sends email through SMTP. Requests normally enter through a lightweight HTTP reverse proxy on port `8000`; the proxy distributes them across Express backend listeners.

## Quick start

Requires Node.js 22+ and npm.

```bash
npm install
node index.js
node proxy.js
```

Or start both processes together:

```bash
bash app.process.sh
```

The default client endpoint is `http://localhost:8000`. For example:

```bash
curl -X POST http://localhost:8000/send \
  -H 'Content-Type: application/json' \
  -d '{"to":"recipient@example.com","subject":"Hello","options":{"text":"Sent by SMTP Service"}}'
```

See [api.md](api.md) for the complete API contract.

## Runtime layout

```text
Client → proxy :8000 → one of the Express backends (:4000, :4001) → SMTP provider
```

`index.js` starts the Express application and `proxy.js` starts the reverse proxy. With the committed configuration, clustering is enabled and the cluster primary forks one worker per available CPU (or `WORKERS` when that environment variable is a positive integer). Each worker serves the same backend listener set. The proxy round-robins requests across ports `4000` and `4001`.

Direct requests to backend ports work, but bypass the proxy's rate limiting and proxy timeout handling.

## Configuration

All runtime configuration is loaded from `json/` during module startup, so restart the affected process after editing it.

| File | Purpose |
|---|---|
| `json/app.json` | Listener addresses and ports, replica count, shutdown/HTTP timeouts, and encryption parameters. |
| `json/config.json` | Feature flags for clustering, replicas, middleware, rate limiting, and timeouts. |
| `json/smtp.config.json` | SMTP host, port, sender account, and missing-field responses. |
| `json/rate-limiting.config.json` | Proxy in-memory request window and limit. |
| `json/logger.config.json` | Console/file logging and fields omitted from request logs. |
| `json/helmet.config.json` | Helmet options. |

The committed defaults bind to `0.0.0.0`, expose the proxy at `8000`, create two backend listeners starting at `4000`, and allow 100 requests per client IP in a 15-minute window. `encryption_Interceptor` is disabled by default.

SMTP credentials currently come from `json/smtp.config.json`. Treat that file as a secret: use a real secret-management or environment-based configuration approach before deploying, and never commit production credentials.

## Middleware and operations

When enabled, middleware is applied in this order:

```text
request ID → Helmet → CORS → JSON parser → encryption → request logger → response logger
```

- `X-Request-ID` is accepted from the client or generated and returned by the backend.
- CORS uses the package default policy.
- The proxy adds `RateLimit-Limit` and `RateLimit-Remaining` headers. A rejected request receives HTTP 429 and `Retry-After`.
- Proxy connection/request failures become 502; enabled upstream request or response timeouts become 504.
- `SIGTERM` and `SIGINT` initiate graceful draining; remaining tracked work is forcibly closed after `SHUTDOWN_TIMEOUT`.
- `WRITE_L0G` (the configuration key is spelled with a zero) enables JSON-line logging in `logs/YYYY-MM-DD.txt`.

The optional encryption interceptor decrypts a request body shaped as `{ "data": "<base64 ciphertext>" }` and replaces every `res.json()` result with `{ "data": "<base64 ciphertext>" }`. It is application-level payload transformation, not TLS; use HTTPS in production.

## Docker

Build and start through the provided script:

```bash
bash docker.process.sh smtp-service 1.0.0
```

The Docker build definition is named `dockerFile`, while `docker-compose.yml` currently references lowercase `dockerfile`. On case-sensitive systems, update the Compose filename to match before using that workflow. Compose publishes ports `8000`, `4000`, and `4001`.

## Project map

```text
index.js                 Express routes and backend startup
proxy.js                 Reverse proxy and upstream forwarding
smtp/                    Nodemailer transport and send operation
layers/                  Clustering, replicas, rate limiting, IDs, shutdown
interceptors/            Express middleware
proxy/                   Upstream timeout/error/abort helpers
json/                    Runtime configuration
```

There are no npm test scripts configured in the current `package.json`.

For component and lifecycle detail, see [architecture.md](architecture.md).

## License

ISC.
