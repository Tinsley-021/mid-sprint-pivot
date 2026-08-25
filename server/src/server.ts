import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import { env } from './lib/env.js';
import { errorHandler } from './lib/http.js';
import { devRouter } from './modules/dev/dev.routes.js';
import { authRouter } from './modules/auth/auth.routes.js';
import { branchesRouter } from './modules/branches/branches.routes.js';
import { productsRouter } from './modules/products/products.routes.js';
import { availabilityRouter } from './modules/products/availability.routes.js';
import { ordersRouter } from './modules/orders/orders.routes.js';
import { alertsRouter } from './modules/alerts/alerts.routes.js';
import { teamRouter } from './modules/team/team.routes.js';
import { customersRouter } from './modules/customers/customers.routes.js';

const app = express();
app.use(helmet());
app.use(cors({ origin: env.CORS_ORIGIN, credentials: true }));
app.use(express.json());
app.use(cookieParser());

app.get('/api/_healthcheck', (_req, res) => res.json({ status: 'ok', phase: 3 }));

app.use('/api/auth', authRouter);
app.use('/api/branches', branchesRouter);
app.use('/api/products', productsRouter);
app.use('/api/orders', ordersRouter);
app.use('/api/alerts', alertsRouter);
app.use('/api/availability', availabilityRouter);
app.use('/api/team', teamRouter);
app.use('/api/customers', customersRouter);

// Unauthenticated demo surface for exercising the Phase 1 inventory core
// directly (used by scripts/concurrency-test.ts). Not exposed to the web app;
// local/testing use only.
app.use('/api/dev/inventory', devRouter);

app.use(errorHandler);

app.listen(env.PORT, () => {
  // eslint-disable-next-line no-console
  console.log(`RetailSync server (phase 3) listening on :${env.PORT}`);
});
