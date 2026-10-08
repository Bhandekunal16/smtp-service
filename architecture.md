# Architecture Overview

## System shape

The application has two independent Node.js processes:

- `index.js`: Express API and backend listener lifecycle.
- `proxy.js`: raw Node.js HTTP reverse proxy.

Both read the same merged JSON configuration. The proxy round-robins requests over the backend port list; it is the intended client entry point.

```text
                         json/*.json
                             │
                    provider/config.map.js
                       ┌─────┴─────┐
                       │           │
                index.js         proxy.js
                   │                 │
          cluster primary?       :8000 listener
                   │                 │
       one worker per CPU       rate-limit layer
                   │                 │
       replica layer creates   next backend port
       :4000 … :4003                │
                   └──── Express API ┘
```

With the committed configuration (`clustering: true`, `REPLICA: true`, `port: 4000`, `replicas: 4`), the cluster primary forks one worker per available CPU. Every worker invokes the replica layer for ports 4000–4003. Node's cluster machinery shares the listener handles for a given port, so workers service the same configured port set; the configuration does not allocate a unique port range per worker.

## Entry points and layers

| Component | Responsibility |
|---|---|
| `index.js` | Creates Express in a worker/standalone process, installs middleware and routes, starts backend listeners, registers shutdown handling. In a cluster primary, starts worker supervision only. |
| `proxy.js` | Listens on `proxyPort`, selects backend ports in round-robin order, forwards the request stream, and applies proxy-only safeguards. |
| `layers/cluster.layer.js` | Forks one worker per CPU and replaces an unexpectedly exited worker; stops replacement after `markClusterShuttingDown()`. |
| `layers/replica.layer.js` | Creates `http` servers around the shared Express app at `port + index`. |
| `layers/graceful.shutdown.layer.js` | Coordinates signal handling, draining, forced cleanup, cluster-primary worker shutdown, and worker IPC shutdown messages. |
| `layers/rate.limiting.layer.js` | Maintains an in-memory counter per `req.socket.remoteAddress`; returns whether forwarding may continue. |
| `layers/request.id.layer.js` | Reuses or creates a request ID, stores it on `req`, and sets the response header. |
| `proxy/` | Isolates upstream request tracking, timeouts, 502 responses, and client-disconnect cleanup. |

`provider/dependency.map.js` is the shared dependency registry for Express, `http`, CORS, Helmet, cluster/OS support, filesystem utilities, `log-byte`, and `performance`. `provider/interceptor.map.js` maps Express middleware plus the cluster and replica layer exports for consumers.

## API composition

In a worker or non-clustered process, `index.js` performs this sequence:

```text
express()
  → middleware(app)
  → active-response tracker
  → GET / route
  → JSON 404 fallback
  → errorMiddleware(app)
  → replicate(app, host, port, REPLICA, replicas)
  → graceful shutdown registration for each returned server
```

`middleware.loader.js` installs enabled items in this exact order:

```text
request ID → Helmet → CORS → JSON parser → encryption → request logger → response logger
```

The only defined route is `GET /`, whose handler calls `res.json({ message: "hello world" })`. If encryption is enabled, its wrapper transforms that JSON response to `{ data: "<ciphertext>" }`. The fallback route returns the project’s JSON 404 response. The error interceptor receives errors after the routes and responds with the error message, `status: false`, and `statusCode: 500` (while the HTTP status uses `err.status` or 500).

## Proxy flow

At module initialization, `proxy.js` derives the target ports:

```text
REPLICA false → [port]
REPLICA true  → [port, port + 1, …, port + replicas - 1]
```

An invalid/non-positive `replicas` value falls back to one port. A module-level index advances after each chosen port, yielding round-robin selection within one proxy process.

```text
client request
  → reject with 503 if shutdown has started
  → optional rate-limit check (429 if denied)
  → choose next backend port
  → http.request(host, chosen port, method, path, headers)
  → track outbound request for shutdown
  → optional request timeout / optional response timeout (504)
  → upstream error handler (502)
  → client-abort handler destroys outbound request
  → pipe request upstream and pipe upstream response to client
```

The proxy forwards the original method, URL, and headers. It neither generates a request ID nor retries failed requests. Rate-limit state is process-local and direct access to backend ports bypasses it.

## Configuration model

`provider/config.map.js` merges, in order, `config.json`, `app.json`, `rate-limiting.config.json`, and `logger.config.json`; it exposes Helmet configuration at `helmet`. Configuration is read when CommonJS modules are loaded, so restart the relevant process after changing JSON files.

| File | Used values |
|---|---|
| `json/app.json` | Host/ports, replica count, proxy/server timeout durations, shutdown timeout, and encryption parameters. |
| `json/config.json` | Middleware, clustering, replication, rate-limit, and timeout feature toggles. |
| `json/rate-limiting.config.json` | `windowMs` and `limit`; other stored rate-limit flags are not consumed by the custom layer. |
| `json/logger.config.json` | Request-log field exclusions and `WRITE_L0G` file-log switch. |
| `json/helmet.config.json` | Options passed to Helmet when nonempty. |

## Logging and local state

The request logger records selected request metadata after JSON parsing and optional decryption. The response logger records request ID, method, URL, status, duration, and content length on `finish`. Both always write a console line; when `WRITE_L0G` is enabled they append raw JSON lines to `logs/YYYY-MM-DD.txt` through `core/file.functions.js`. The helper creates `logs/` if necessary.

Rate-limit counters are a `Map` in the proxy process. Active upstream requests and active Express responses are `Set`s used only to drain during shutdown. Neither mechanism provides shared or durable state across processes, restarts, or hosts.

## Shutdown and process interaction

The HTTP shutdown path is configured once per process. On `SIGTERM`/`SIGINT`, the proxy or API server calls `server.close()`, waits for its tracked set to empty, and exits successfully. On timeout it destroys tracked sockets/requests and exits with code 1. New proxy requests observed after shutdown begins receive 503.

The cluster primary has no HTTP listener. On a signal it marks the cluster as shutting down, sends each worker the `shutdown` IPC message, waits for worker exits, and kills remaining workers after `SHUTDOWN_TIMEOUT`. Workers handle that message by triggering their normal HTTP shutdown path. This mark also prevents the cluster layer's exit listener from forking replacement workers.

## Deployment and test boundaries

`app.process.sh` manages the two runtime entry points for a local/container process. Docker configuration exposes 8000 and 4000–4003, but `docker-compose.yml` currently refers to lowercase `dockerfile` while the tracked Docker definition is `dockerFile`; that casing must match on case-sensitive systems.

Jest tests reside in `test/` and use test factories for Express and proxy behavior. The current test tree still contains imports for modules removed/moved by the layer refactor (notably the root `createProxyServer` path and `interceptors/cluster.interceptor.js`), so it is not an authoritative executable description until those imports are migrated.

## Constraints

This is a local/demo-oriented HTTP architecture. It has no TLS termination, authentication, validation, shared rate-limit store, retry policy, or durable logging. The custom encryption middleware is application-level payload transformation and does not secure the HTTP transport.
