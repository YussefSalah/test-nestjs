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

  await app.listen(3001);
}
bootstrap();