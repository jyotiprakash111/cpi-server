import Fastify, { FastifyInstance } from 'fastify';
import cors from '@fastify/cors';
import { syncRoutes } from './api/routes/sync.routes.js';
import { manifestRoutes } from './api/routes/manifest.routes.js';
import { quarantineRoutes } from './api/routes/quarantine.routes.js';
import { reportRoutes } from './api/routes/report.routes.js';
import { schemaRoutes } from './api/routes/schema.routes.js';

export function buildApp(): FastifyInstance {
  const server = Fastify({
    logger: true,
  });

  // Enable CORS
  server.register(cors, {
    origin: true,
  });

  // Health check endpoint
  server.get('/health', async () => {
    return {
      status: 'UP',
      service: 'cpi-backend',
      timestamp: new Date().toISOString(),
      uptimeSeconds: process.uptime(),
    };
  });

  // Root info endpoint
  server.get('/', async () => {
    return {
      name: 'Cost Plus, Inc. (CPI) Commissioning & Audit API',
      version: '1.0.0',
      docs: '/api/v1/health',
      endpoints: [
        'POST /api/v1/sync/batch',
        'GET /api/v1/manifests',
        'GET /api/v1/manifests/search',
        'GET /api/v1/quarantine',
        'POST /api/v1/quarantine/:id/resolve',
        'GET /api/v1/reports/reconciliation',
        'GET /api/v1/reports/irr/:iasNo',
        'GET /api/v1/schemas/active',
      ],
    };
  });

  // Register API v1 routes
  server.register(
    async (v1) => {
      v1.register(syncRoutes);
      v1.register(manifestRoutes);
      v1.register(quarantineRoutes);
      v1.register(reportRoutes);
      v1.register(schemaRoutes);
    },
    { prefix: '/api/v1' }
  );

  return server;
}
