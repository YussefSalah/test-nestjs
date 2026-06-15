"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.RequestCountInterceptor = void 0;
const common_1 = require("@nestjs/common");
const rxjs_1 = require("rxjs");
const Sentry = require("@sentry/node");
const COLLECTOR_URL = 'http://localhost:3000/api/collect/metrics';
const DSN_KEY = process.env.DSN_KEY || '';
let RequestCountInterceptor = class RequestCountInterceptor {
    intercept(context, next) {
        const start = Date.now();
        const request = context.switchToHttp().getRequest();
        const route = request.route?.path || request.url || 'unknown';
        return next.handle().pipe((0, rxjs_1.tap)(() => this.record(route, 'ok', start)), (0, rxjs_1.catchError)((err) => {
            Sentry.captureException(err);
            this.record(route, 'error', start);
            return (0, rxjs_1.throwError)(() => err);
        }));
    }
    async record(route, status, start) {
        if (!DSN_KEY)
            return;
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
        }
        catch { }
    }
};
exports.RequestCountInterceptor = RequestCountInterceptor;
exports.RequestCountInterceptor = RequestCountInterceptor = __decorate([
    (0, common_1.Injectable)()
], RequestCountInterceptor);
//# sourceMappingURL=request-count.interceptor.js.map