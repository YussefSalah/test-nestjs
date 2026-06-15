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