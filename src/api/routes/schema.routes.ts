import { FastifyPluginAsync } from 'fastify';

export const schemaRoutes: FastifyPluginAsync = async (server) => {
  server.get('/schemas/active', async (_request, reply) => {
    return reply.send({
      id: 'cpi-site-commissioning-standard',
      version: '1.0.0',
      title: 'Site Commissioning Form',
      subtitle: 'Offline Field Capture · Philippine Rural Solar Program',
      lastUpdated: new Date().toISOString(),
      sectionsCount: 3,
      supportedCoops: ['PALECO', 'FIBECO', 'MORE Power', 'ILECO'],
    });
  });
};
