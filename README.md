# Proxy Server

A CommonJS Node.js example consisting of an Express API, a Node.js HTTP reverse proxy, optional backend replicas, and optional Node cluster workers. Runtime behavior is controlled by JSON files in `json/`.

## What runs

- `index.js` starts the Express API. When `clustering` is enabled, its primary process forks one worker per CPU; workers start the HTTP listeners.
- `proxy.js` starts the client-facing reverse proxy. It forwards requests to backend ports in round-robin order.
- `layers/replica.layer.js` creates one backend listener, or `replicas` consecutive listeners, according to `REPLICA`.

With the committed configuration, the proxy listens on port `8000`; the backend replica ports are `4000`–`4003`. Because clustering is enabled, Node's cluster mechanism shares those worker listeners rather than assigning unique port ranges per worker.

## Request path

```text
Client → proxy :8000 → rate-limit check → backend :4000/:4001/:4002/:4003 → Express middleware → route
```

The proxy selects the next configured backend port for every request. Direct requests to a backend port bypass proxy-only rate limiting and proxy timeout handling.

## Features

- `GET /` returns the API's hello-world payload; unmatched routes return JSON 404.
- Optional request IDs, Helmet headers, CORS, JSON parsing, encryption, request logging, response logging, and error middleware.
- Per-IP, in-memory proxy rate limiting.
- Upstream request/response timeouts (504), upstream errors (502), and client-abort handling.
- Graceful `SIGTERM`/`SIGINT` shutdown for HTTP servers and cluster coordination.
- Local JSON-line logging under `logs/` when enabled.

## Installation

Requires Node.js and npm. The Docker image uses Node.js 22.

```bash
npm install
```

## Run locally

Start the backend and proxy in separate terminals:

```bash
node index.js
node proxy.js
```

Or start both through the supplied process script:

```bash
bash app.process.sh
```

`app.process.sh` starts both processes in the background, waits until either exits, then sends `SIGTERM` to both PIDs.

Send traffic through the proxy:

```bash
curl http://localhost:8000/
```

With `encryption_Interceptor: true` (the committed default), the JSON response is wrapped and encrypted:

```json
{ "data": "<base64 ciphertext>" }
```

To receive the plain route payload during local experimentation, set `encryption_Interceptor` to `false` in `json/config.json` and restart the backend. The unwrapped route payload is:

```json
{ "message": "hello world" }
```

## Routes and proxy responses

| Path / condition | Result |
|---|---|
| `GET /` | 200 from the Express route (encrypted when encryption middleware is enabled) |
| Any unmatched Express route | JSON 404: `status: false`, `statusCode: 404`, `message: "Not Found"` |
| Proxy upstream error | 502 `Bad Gateway` |
| Enabled upstream timeout | 504 `Gateway Timeout` |
| Request while the proxy drains | 503 `Service Unavailable` |
| Rate limit exceeded | JSON 429 with `Retry-After` |

The proxy preserves the method, URL path, and request headers when it creates the upstream request. It does not expose a separate application API beyond forwarding traffic.

## Configuration

`provider/config.map.js` exports one object assembled from:

1. `json/config.json`
2. `json/app.json`
3. `json/rate-limiting.config.json`
4. `json/logger.config.json`

The Helmet file is attached separately as `helmet`: `json/helmet.config.json`. Later spreads override earlier duplicate keys.

### Current runtime values

`json/app.json` currently defines:

| Setting | Current value | Used for |
|---|---:|---|
| `host` | `0.0.0.0` | Bind address and proxy upstream hostname |
| `port` | `4000` | First backend port |
| `proxyPort` | `8000` | Proxy listener |
| `replicas` | `4` | Number of backend ports when `REPLICA` is true |
| `PROXY_TIMEOUT` | `30000` ms | Enabled upstream request/response timeouts |
| `HEADERS_TIMEOUT` | `10000` ms | Enabled proxy `headersTimeout` |
| `KEEP_ALIVE_TIMEOUT` | `5000` ms | Enabled proxy `keepAliveTimeout` |
| `SHUTDOWN_TIMEOUT` | `10000` ms | Graceful-shutdown deadline |

`json/config.json` contains feature switches:

| Flag | Scope |
|---|---|
| `clustering` | Forks API workers from the cluster primary |
| `REPLICA` | Creates `replicas` listeners starting at `port`; otherwise creates only `port` |
| `rateLimiting` | Enables the proxy-edge rate limiter |
| `requestId`, `helmet_interceptor`, `encryption_Interceptor`, `logger_interceptor`, `response_interceptor`, `errorInterceptor` | Express middleware |
| `ENABLE_UPSTREAM_REQUEST_TIMEOUT`, `ENABLE_UPSTREAM_RESPONSE_TIMEOUT` | Proxy upstream timeouts |
| `ENABLE_CLIENT_HEADERS_TIMEOUT`, `ENABLE_CLIENT_KEEP_ALIVE_TIMEOUT` | Proxy server timeouts |

`json/rate-limiting.config.json` currently permits 100 requests per IP per 900,000 ms (15 minutes). The layer emits `RateLimit-Limit` and `RateLimit-Remaining`; it does not read the stored `standardHeaders` or `legacyHeaders` values.

`json/logger.config.json` controls request-field exclusions and `WRITE_L0G` (spelled with a zero), which enables appending request and response records to `logs/YYYY-MM-DD.txt`.

## Middleware order

For an API worker, `middleware.loader.js` applies enabled middleware in this order:

```text
request ID → Helmet → CORS → express.json() → encryption → request logger → response logger
```

Routes follow that stack, then the 404 handler, then the optional Express error middleware. Request IDs are reused from `X-Request-ID` or generated with `crypto.randomUUID()` and returned as `X-Request-ID`. The proxy forwards any incoming request-ID header but does not generate one.

The encryption interceptor only decrypts JSON request bodies containing `data`. It replaces `res.json()` so every JSON route response is encrypted. It is a demonstration layer, not a replacement for HTTPS/TLS.

## Logging and shutdown

Request and response summaries are written to the console. With `WRITE_L0G: true`, they are also appended as JSON lines under `logs/`; request exclusions apply only to request logs. The backend/proxy startup and HTTP shutdown messages use `log-byte`.

On `SIGTERM` or `SIGINT`, a standalone API process or proxy stops accepting connections, waits for tracked work, then exits `0`; remaining tracked sockets are destroyed and the process exits `1` after `SHUTDOWN_TIMEOUT`. A cluster primary signals its workers and suppresses worker replacement during this coordinated shutdown.

## Docker

The repository includes `dockerFile`, `docker-compose.yml`, and `docker.process.sh`. The script builds with `dockerFile` and passes an image name/tag to Compose:

```bash
bash docker.process.sh proxy-server 1.0.0
```

The Compose file currently names its build file `dockerfile` (lowercase), while the tracked file is `dockerFile`. On case-sensitive filesystems, align that filename before relying on the Compose workflow. It publishes 8000 and backend ports 4000–4003 and mounts `./logs` at `/app/logs`.

## Tests

```bash
npm test
npm run test:unit
npm run test:integration
npm run test:coverage
```

Tests are organized under `test/unit` and `test/integration`, with factories under `test/helpers`. The current source refactor moved the cluster and replica modules into `layers/`; some tracked test imports still reference the removed root-level `createProxyServer` helper and old `interceptors/cluster.interceptor.js` path. Update those tests before treating the full test command as a passing verification of this revision.

## Project map

```text
index.js / proxy.js        Runtime entry points
layers/                    Cluster, replica, request-ID, rate-limit, shutdown behavior
interceptors/              Express middleware implementations
proxy/                     Upstream errors, timeouts, tracking, client-abort handling
provider/                  Shared dependency, configuration, and module maps
json/                      Runtime configuration
test/                      Jest unit and integration tests
```

See [architecture.md](architecture.md) for the component-level design.

## License

ISC, as declared in `package.json`.
