import { FastifyPluginAsync } from 'fastify';
import { ManifestService } from '../../services/manifest.service.js';

export const manifestRoutes: FastifyPluginAsync = async (server) => {
  server.get('/manifests', async (_request, reply) => {
    const units = ManifestService.getAllUnits();
    return reply.send({ total: units.length, units });
  });

  server.get<{ Querystring: { query?: string } }>('/manifests/search', async (request, reply) => {
    const query = request.query.query || '';
    if (!query) {
      return reply.send({ results: [] });
    }
    const results = ManifestService.searchUnits(query);
    return reply.send({ count: results.length, results });
  });
};
