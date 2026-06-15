"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
require("dotenv/config");
const Sentry = require("@sentry/node");
const node_1 = require("@sentry/node");
const core_1 = require("@sentry/core");
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
    transport: (options) => {
        const base = (0, node_1.makeNodeTransport)(options);
        return {
            send: async (envelope) => {
                const raw = (0, core_1.serializeEnvelope)(envelope);
                const rawStr = typeof raw === 'string' ? raw : new TextDecoder().decode(raw);
                const lines = rawStr.split('\n');
                try {
                    const header = JSON.parse(lines[0]);
                    header.dsn = dsn;
                    lines[0] = JSON.stringify(header);
                }
                catch (_) { }
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
//# sourceMappingURL=instrument.js.map