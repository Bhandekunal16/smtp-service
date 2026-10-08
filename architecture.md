# Architecture

## Components

The service runs two Node.js processes with shared JSON configuration:

```text
                         json/*.json
                              │
                    provider/config.map.js
                       ┌──────┴──────┐
                       │             │
                  index.js        proxy.js
                       │             │
              cluster primary      :8000 server
                       │             │
          Express workers/listeners rate limiting
                  :4000, :4001      │
                       └─────→ SMTP transport
```

`index.js` creates the Express app and the backend listeners. When `clustering` is enabled, only the cluster primary runs in the initial process; it forks one worker per CPU (or the positive integer in `WORKERS`). Workers create the Express listeners. Node cluster shares a listener handle for a given port, so workers serve the same ports rather than receiving separate port ranges.

`proxy.js` is the public HTTP edge. It selects each target port in round-robin order and streams the incoming request to it. With the committed configuration (`REPLICA: true`, `port: 4000`, `replicas: 2`), targets are `4000` and `4001`.

## Request flow

```text
POST /send
  → proxy shutdown check
  → optional per-IP rate limiter
  → selected backend port
  → Express middleware
  → route handler
  → smtp/smtp.service.js
  → Nodemailer SMTP transport
  → JSON response → proxy → client
```

The proxy preserves request method, URL, and headers. It does not retry requests, generate request IDs, authenticate clients, or validate message contents. Calling a backend port directly bypasses proxy-only safeguards.

## Express composition

Each worker (or a standalone `index.js` process when clustering is disabled) applies this sequence:

```text
express()
  → middleware(app)
  → active-response tracking
  → GET /
  → POST /send
  → 404 handler
  → optional error handler
  → one or more HTTP servers
```

Enabled middleware order is:

```text
request ID → Helmet → CORS → JSON parser → encryption → request logger → response logger
```

`POST /send` passes `req.body.to`, `req.body.subject`, and `req.body.options` to the SMTP service. That service builds a Nodemailer transport for each request from the configured SMTP host, port, user, and password; it sends `{ from: user, to, subject, ...options }`. The `options` object can therefore supply Nodemailer message fields such as `text`, `html`, `cc`, `bcc`, and attachments. See [api.md](api.md) for the public contract.

## Proxy safeguards

The proxy maintains an in-memory `Map` keyed by `req.socket.remoteAddress`. It returns the `RateLimit-Limit` and `RateLimit-Remaining` headers on allowed requests and responds with 429 plus `Retry-After` once the configured limit is exceeded. The state is local to one proxy process and is lost on restart.

When enabled, the proxy applies the same `PROXY_TIMEOUT` duration independently to the outbound request and upstream response. It returns 504 for either timeout and 502 for an upstream request error. Incoming client disconnects destroy the corresponding outbound request.

## Configuration and state

`provider/config.map.js` merges `config.json`, `app.json`, `rate-limiting.config.json`, `logger.config.json`, and `smtp.config.json`; it attaches `helmet.config.json` under `helmet`. CommonJS loads these JSON values at startup, so configuration changes require a restart.

Request and response logging can emit to the console and, with `WRITE_L0G: true`, append JSON lines under `logs/`. Active proxy requests and Express responses are held in in-memory `Set`s only to support graceful shutdown. No state is shared across workers, processes, or hosts.

## Shutdown

On `SIGTERM` or `SIGINT`, an HTTP process closes its server to new connections, waits for its tracked work to finish, and exits successfully. After `SHUTDOWN_TIMEOUT`, it destroys remaining tracked sockets/requests and exits with code 1.

The cluster primary has no HTTP listener. It marks the cluster as shutting down, sends workers a `shutdown` IPC message, waits for their exits, and kills remaining workers after the same deadline. Marking shutdown also prevents automatic replacement of workers that exit during this period.

## Boundaries

This is a demo-oriented HTTP service. It has no TLS termination, authentication/authorization, schema validation, shared or durable rate limiting, durable logging, retry/queueing for email, or secret management. The optional encryption interceptor does not secure transport; deploy behind HTTPS and externalize SMTP credentials for production.
