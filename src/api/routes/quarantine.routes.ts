import { FastifyPluginAsync } from 'fastify';
import { ReconciliationService } from '../../services/reconciliation.service.js';

export const quarantineRoutes: FastifyPluginAsync = async (server) => {
  server.get('/quarantine', async (_request, reply) => {
    const list = ReconciliationService.getQuarantineList();
    return reply.send({
      total: list.length,
      unresolvedCount: list.filter((q) => !q.isResolved).length,
      quarantineRecords: list,
    });
  });

  server.post<{
    Params: { id: string };
    Body: { action: 'APPROVE_OVERRIDE' | 'REJECT_REQUEST_RETAKE'; notes?: string };
  }>('/quarantine/:id/resolve', async (request, reply) => {
    const { id } = request.params;
    const { action, notes } = request.body || { action: 'APPROVE_OVERRIDE' };

    const resolved = ReconciliationService.resolveQuarantine(id, action, notes);
    if (!resolved) {
      return reply.status(404).send({ error: 'Quarantine record not found' });
    }

    return reply.send({
      status: 'RESOLVED',
      record: resolved,
    });
  });
};
