import { FastifyPluginAsync } from 'fastify';
import { ReconciliationService } from '../../services/reconciliation.service.js';
import { ManifestService } from '../../services/manifest.service.js';
import { PdfService } from '../../services/pdf.service.js';

export const reportRoutes: FastifyPluginAsync = async (server) => {
  server.get('/reports/reconciliation', async (_request, reply) => {
    const report = ReconciliationService.getReconciliationReport();
    return reply.send(report);
  });

  server.get<{ Params: { iasNo: string } }>('/reports/irr/:iasNo', async (request, reply) => {
    const { iasNo } = request.params;
    const unit = ManifestService.findUnitByIas(iasNo);

    if (!unit) {
      return reply.status(404).send({ error: `Unit ${iasNo} not found in master manifest` });
    }

    const pdfBuffer = await PdfService.generateIrrReport(unit, {}, [
      {
        slotId: 'excavation',
        groupId: 'foundationPhotos',
        label: 'Foundation: Excavation',
        filename: `${iasNo}_excavation.jpg`,
        md5: 'mock_md5_excavation',
        dHash: '0123456789abcdef',
        capturedAt: new Date().toISOString(),
        isMock: true,
      },
      {
        slotId: 'steel_binding',
        groupId: 'foundationPhotos',
        label: 'Foundation: Steel Binding',
        filename: `${iasNo}_steel.jpg`,
        md5: 'mock_md5_steel',
        dHash: 'fedcba9876543210',
        capturedAt: new Date().toISOString(),
        isMock: true,
      },
      {
        slotId: 'front',
        groupId: 'structurePhotos',
        label: 'Structure: Front Elevation',
        filename: `${iasNo}_front.jpg`,
        md5: 'mock_md5_front',
        dHash: 'abcdef0123456789',
        capturedAt: new Date().toISOString(),
        isMock: true,
      },
    ]);

    reply
      .header('Content-Type', 'application/pdf')
      .header('Content-Disposition', `inline; filename="IRR_${iasNo}.pdf"`)
      .send(pdfBuffer);
  });
};
