import cors from 'cors';
import express, { type Express } from 'express';
import helmet from 'helmet';
import morgan from 'morgan';

import { env } from './config/env.js';
import { errorHandler } from './middleware/errorHandler.js';
import routes from './routes/index.js';

const app: Express = express();

// Security middleware
app.use(helmet());
app.use(cors({
  origin: env.NODE_ENV === 'production'
    ? (env.CORS_ORIGIN ? env.CORS_ORIGIN.split(',') : true) // true allows all origins
    : ['http://localhost:5173', 'http://localhost:3000'],
  credentials: true,
}));

// Request parsing
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Logging
if (env.NODE_ENV !== 'test') {
  app.use(morgan(env.NODE_ENV === 'production' ? 'combined' : 'dev'));
}

// API routes
app.use('/api/v1', routes);

// Root health check
app.get('/', (_req, res) => {
  res.json({ message: 'Arbitrage Scanner API', version: '0.1.0' });
});

// Error handler (must be last)
app.use(errorHandler);

export default app;
