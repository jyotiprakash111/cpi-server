import { FastifyPluginAsync } from 'fastify';
import { SyncBatchPayload } from '../../types/index.js';
import { ReconciliationService } from '../../services/reconciliation.service.js';

export const syncRoutes: FastifyPluginAsync = async (server) => {
  server.post<{ Body: SyncBatchPayload }>('/sync/batch', async (request, reply) => {
    const payload = request.body;

    if (!payload.submissionUuid || !payload.iasNo) {
      return reply.status(400).send({
        error: 'Invalid payload: submissionUuid and iasNo are required',
      });
    }

    const result = await ReconciliationService.processSubmission(payload);

    if (result.status === 'QUARANTINED') {
      return reply.status(200).send({
        status: 'QUARANTINED',
        submissionUuid: payload.submissionUuid,
        iasNo: payload.iasNo,
        message: 'Submission quarantined due to photo collision/duplicate detected',
        duplicates: result.duplicates,
        quarantineReasons: result.quarantineReasons,
      });
    }

    return reply.status(200).send({
      status: 'APPROVED',
      submissionUuid: payload.submissionUuid,
      iasNo: payload.iasNo,
      message: 'Submission successfully verified and approved for IRR compilation',
    });
  });
};
