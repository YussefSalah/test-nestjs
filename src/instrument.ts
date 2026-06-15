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