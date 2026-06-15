"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
require("./instrument");
const Sentry = require("@sentry/node");
const core_1 = require("@nestjs/core");
const app_module_1 = require("./app.module");
const metrics_reporter_1 = require("./metrics-reporter");
const request_count_interceptor_1 = require("./request-count.interceptor");
async function bootstrap() {
    (0, metrics_reporter_1.startMetricsReporter)();
    const app = await core_1.NestFactory.create(app_module_1.AppModule);
    app.useGlobalInterceptors(new request_count_interceptor_1.RequestCountInterceptor());
    Sentry.setupExpressErrorHandler(app);
    app.use((err, req, res, _next) => {
        res.status(500).json({ error: err.message });
    });
    await app.listen(3001);
}
bootstrap();
//# sourceMappingURL=main.js.map