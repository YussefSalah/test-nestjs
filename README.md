# ServerMentor — NestJS Integration Guide

Integrate your NestJS app with ServerMentor in minutes. No custom SDK — just the standard `@sentry/node` SDK for error capture, plus a simple interceptor for request counting.

---

## How It Works

```
Your NestJS App
  │
  ├─ @sentry/node SDK  →  captures errors
  │     └─ Custom transport  →  POST /api/collect  (Sentry envelope)
  │
  ├─ RequestCountInterceptor  →  counts every request
  │     └─ Direct POST  →  /api/collect/metrics  (JSON + x-servermentor-dsn)
  │
  ├─ metrics-reporter.ts  →  reads OS CPU/memory every 10s
  │     └─ Direct POST  →  /api/collect/metrics  (JSON + x-servermentor-dsn)
  │
  ▼
  https://your-ngrok.ngrok-free.dev  (ngrok tunnel)
  ▼
  localhost:3000  (ServerMentor Collector)
  ▼
  PostgreSQL  →  Dashboard
```

---

## Step 1 — Install Dependencies

```bash
npm install @sentry/node @sentry/core dotenv
```

---

## Step 2 — Get Your DSN Key

1. Open your project in ServerMentor
2. Go to **Settings** or **Metrics** page
3. Copy the **DSN Key** (a hex string like `c23d1938a1e62a24fdeedd2fc643d29d`)

---

## Step 3 — Create `src/instrument.ts`

This file initializes Sentry with a custom transport that sends error envelopes to your ServerMentor collector instead of sentry.io.

```typescript
import 'dotenv/config';
import * as Sentry from '@sentry/node';
import { makeNodeTransport } from '@sentry/node';
import { serializeEnvelope } from '@sentry/core';

const DSN_KEY = process.env.DSN_KEY || '';
const COLLECTOR_URL = process.env.COLLECTOR_URL || 'http://localhost:3000';

if (!DSN_KEY) {
  console.error('❌ DSN_KEY not set');
  process.exit(1);
}

const dsn = `https://${DSN_KEY}@${COLLECTOR_URL.replace(/https?:\/\//, '')}/1`;

Sentry.init({
  dsn,
  environment: process.env.ENVIRONMENT || 'development',

  // Custom transport: sends envelopes to your collector instead of sentry.io
  transport: (options) => {
    const base = makeNodeTransport(options);
    return {
      send: async (envelope) => {
        const raw = serializeEnvelope(envelope);
        const rawStr = typeof raw === 'string' ? raw : new TextDecoder().decode(raw);

        // Inject DSN into envelope header so collector can identify the project
        const lines = rawStr.split('\n');
        try {
          const header = JSON.parse(lines[0]);
          header.dsn = dsn;
          lines[0] = JSON.stringify(header);
        } catch (_) {}

        await fetch(`${COLLECTOR_URL}/api/collect`, {
          method: 'POST',
          headers: { 'Content-Type': 'text/plain' },
          body: lines.join('\n'),
        });
        return {};
      },
      flush: (timeout) => base.flush(timeout),
    };
  },

  integrations: [
    Sentry.httpIntegration({
      ignoreOutgoingRequests: (url) => url.includes(COLLECTOR_URL),
    }),
  ],
});
```

---

## Step 4 — Create `src/main.ts`

Import `instrument` first, then add `RequestCountInterceptor` and `Sentry.setupExpressErrorHandler`.

```typescript
import './instrument';                           // ← FIRST — runs Sentry.init()
import * as Sentry from '@sentry/node';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { startMetricsReporter } from './metrics-reporter';
import { RequestCountInterceptor } from './request-count.interceptor';

async function bootstrap() {
  startMetricsReporter();                        // starts OS CPU/memory reporting

  const app = await NestFactory.create(AppModule);

  // Counts every request → sends http_requests_total / http_errors_total to collector
  app.useGlobalInterceptors(new RequestCountInterceptor());

  // Captures unhandled exceptions and sends them via Sentry envelope
  Sentry.setupExpressErrorHandler(app);

  app.use((err, req, res, _next) => {
    res.status(500).json({ error: err.message });
  });

  await app.listen(3000);
}
bootstrap();
```

---

## Step 5 — Create `src/request-count.interceptor.ts`

This interceptor fires on every HTTP request and POSTs counter metrics directly to your collector.

```typescript
import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
} from '@nestjs/common';
import { Observable, tap, catchError, throwError } from 'rxjs';

import * as Sentry from '@sentry/node';

const COLLECTOR_URL = 'http://localhost:3000/api/collect/metrics';
const DSN_KEY = process.env.DSN_KEY || '';

@Injectable()
export class RequestCountInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const start = Date.now();
    const request = context.switchToHttp().getRequest();
    const route = request.route?.path || request.url || 'unknown';

    return next.handle().pipe(
      tap(() => this.record(route, 'ok', start)),
      catchError((err) => {
        Sentry.captureException(err); // <-- Manually capture the error!
        this.record(route, 'error', start);
        return throwError(() => err);
      }),
    );
  }

  private async record(route: string, status: string, start: number) {
    if (!DSN_KEY) return;
    const timestamp = new Date(start).toISOString();

    try {
      await fetch(COLLECTOR_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-servermentor-dsn': DSN_KEY,
        },
        body: JSON.stringify([
          { name: 'http_requests_total', value: 1, timestamp, tags: { route, status } },
          ...(status === 'error'
            ? [{ name: 'http_errors_total', value: 1, timestamp, tags: { route } }]
            : []),
        ]),
      });
    } catch {}
  }
}
```

---

## Step 6 — OS Metrics Reporter (Optional)

Create `src/metrics-reporter.ts` for CPU and memory data:

```typescript
import * as os from 'os';

const COLLECTOR_URL = 'http://localhost:3000/api/collect/metrics';
const DSN_KEY = process.env.DSN_KEY || '';

let prevCpus = os.cpus();

function getCpuPercent(): number {
  const cpus = os.cpus();
  let idleDiff = 0, totalDiff = 0;
  for (let i = 0; i < cpus.length; i++) {
    const prev = prevCpus[i].times;
    const curr = cpus[i].times;
    const prevTotal = Object.values(prev).reduce((a, b) => a + b, 0);
    const currTotal = Object.values(curr).reduce((a, b) => a + b, 0);
    idleDiff += curr.idle - prev.idle;
    totalDiff += currTotal - prevTotal;
  }
  prevCpus = cpus;
  if (totalDiff === 0) return 0;
  return Math.round((1 - idleDiff / totalDiff) * 1000) / 10;
}

export function startMetricsReporter(): void {
  if (!DSN_KEY) return;

  setInterval(async () => {
    const cpuPercent = getCpuPercent();
    const memUsedMb = Math.round((os.totalmem() - os.freemem()) / 1024 / 1024);

    await fetch(COLLECTOR_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-servermentor-dsn': DSN_KEY,
      },
      body: JSON.stringify([
        { name: 'cpu_usage_percent', value: cpuPercent, tags: { host: os.hostname() } },
        { name: 'memory_used_mb', value: memUsedMb, tags: { host: os.hostname() } },
      ]),
    });
  }, 10000);
}
```

---

## Step 7 — Environment Variables

```bash
# .env
DSN_KEY=c23d1938a1e62a24fdeedd2fc643d29d
COLLECTOR_URL=https://thermotactic-thomas-semibureaucratically.ngrok-free.dev
ENVIRONMENT=development
```

| Variable | Description |
|----------|-------------|
| `DSN_KEY` | Your project's DSN key (from Settings / Metrics page) |
| `COLLECTOR_URL` | Your ServerMentor collector URL (ngrok or direct) |
| `ENVIRONMENT` | Environment label shown in the dashboard |

---

## Step 8 — Run

```bash
# Build TS → JS
npm run build

# Start
npm start
```

For development with hot-reload:
```bash
npm run dev
```

---

## Step 9 — Verify

Add a test endpoint:

```typescript
@Get('debug-sentry')
test() {
  throw new Error('Test error — setup complete!');
}
```

Hit it:

```bash
curl http://localhost:3000/debug-sentry
curl http://localhost:3000/ok
```

Check your ServerMentor dashboard:
- **Issues** → error appears within seconds
- **Dashboards** → CPU, memory, request count, and error rate charts populate

---

## Project Structure

```
src/
├── instrument.ts                  # Sentry.init + custom transport
├── metrics-reporter.ts            # OS CPU/memory reporter
├── request-count.interceptor.ts   # Counts requests per route
├── main.ts                        # App bootstrap
├── app.module.ts
├── app.controller.ts
└── app.service.ts
```

---

## Full `package.json`

```json
{
  "scripts": {
    "build": "nest build",
    "start": "node dist/main.js",
    "dev": "nest start --watch"
  },
  "dependencies": {
    "@nestjs/common": "^11.0.0",
    "@nestjs/core": "^11.0.0",
    "@nestjs/platform-express": "^11.0.0",
    "@sentry/core": "^8.55.2",
    "@sentry/node": "^8.55.2",
    "dotenv": "^17.4.2",
    "reflect-metadata": "^0.2.2",
    "rxjs": "^7.8.1"
  },
  "devDependencies": {
    "@nestjs/cli": "^11.0.0",
    "@nestjs/schematics": "^11.0.0",
    "@types/node": "^22.0.0",
    "typescript": "^5.7.0",
    "ts-node": "^10.9.2"
  }
}
```