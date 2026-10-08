# API reference

Base URL: `http://localhost:8000`

The proxy is the intended entry point. Backend ports (`4000` and `4001` with the committed configuration) expose the same Express routes but bypass proxy rate limiting and proxy timeout handling.

## `GET /`

Returns a basic service response.

```http
GET / HTTP/1.1
```

```json
{ "message": "hello world" }
```

## `POST /send`

Sends a message using the configured SMTP account.

```http
POST /send
Content-Type: application/json
```

```json
{
  "to": "recipient@example.com",
  "subject": "Welcome",
  "options": {
    "text": "Hello from SMTP Service",
    "html": "<p>Hello from SMTP Service</p>",
    "cc": "copy@example.com",
    "bcc": "hidden-copy@example.com"
  }
}
```

`to` and `subject` are required. `options` is optional and is spread into Nodemailer's message object after the configured `from`, `to`, and `subject`; it can include supported Nodemailer message fields. Avoid supplying `from`, `to`, or `subject` in `options`, because those values can override the earlier fields.

Successful sends return HTTP 200:

```json
{
  "response": {
    "messageId": "<...>",
    "messageSize": 123,
    "messageTime": 45,
    "response": "250 ...",
    "rejected": [],
    "rejectedErrors": []
  },
  "status": true,
  "statusCode": 200
}
```

If `to` or `subject` is absent, the service returns HTTP 200 with its configured missing-field object (whose body currently has `statusCode: 404`). This reflects the current implementation; clients should inspect `status` rather than treating the HTTP status alone as validation.

SMTP failures are handled by Express's error middleware when enabled and normally return HTTP 500:

```json
{
  "message": "SMTP error message",
  "status": false,
  "statusCode": 500
}
```

## Common responses and headers

| Condition | HTTP status | Body / headers |
|---|---:|---|
| Unknown route | 404 | `{ "status": false, "statusCode": 404, "message": "Not Found" }` |
| Proxy cannot connect upstream | 502 | `Bad Gateway` |
| Enabled proxy upstream timeout | 504 | `Gateway Timeout` |
| Proxy draining during shutdown | 503 | `Service Unavailable` |
| Rate limit exceeded | 429 | Configured rate-limit response and `Retry-After` |

The proxy adds `RateLimit-Limit` and `RateLimit-Remaining`. The backend accepts `X-Request-ID` or generates one and returns it in the response.

## Optional encrypted payloads

When `encryption_Interceptor` is enabled in `json/config.json`, submit a JSON object containing encrypted base64 data instead of the plain request body:

```json
{ "data": "<base64 ciphertext>" }
```

Every Express JSON response, including errors and 404 responses, is then returned as `{ "data": "<base64 ciphertext>" }`. This feature is disabled by default and is not a substitute for HTTPS.
