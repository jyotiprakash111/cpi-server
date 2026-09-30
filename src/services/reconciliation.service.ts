import {
  DuplicateMatch,
  ManifestUnit,
  PhotoEntry,
  QuarantineRecord,
  ReconciliationReport,
  SyncBatchPayload,
} from '../types/index.js';
import { DeduplicationService } from './deduplication.service.js';
import { ManifestService } from './manifest.service.js';

export class ReconciliationService {
  private static submissions = new Map<string, SyncBatchPayload>();
  private static photoRegistry = new Map<
    string,
    { photo: PhotoEntry; iasNo: string; beneficiaryName: string }
  >();
  private static duplicatePairs: DuplicateMatch[] = [];
  private static quarantineRecords = new Map<string, QuarantineRecord>();
  private static generatedPdfs: string[] = [];

  /**
   * Processes an incoming mobile batch submission
   */
  static async processSubmission(payload: SyncBatchPayload): Promise<{
    status: 'APPROVED' | 'QUARANTINED';
    duplicates: DuplicateMatch[];
    quarantineReasons?: string[];
  }> {
    this.submissions.set(payload.submissionUuid, payload);

    const unit = ManifestService.findUnitByIas(payload.iasNo);
    const beneficiaryName = unit?.beneficiaryName || 'Unknown Beneficiary';

    // 1. Process and hash photos
    const photoEntries: PhotoEntry[] = [];
    for (const p of payload.photos) {
      const buffer = p.base64Data
        ? Buffer.from(p.base64Data, 'base64')
        : Buffer.from(`mock_photo_${payload.iasNo}_${p.slotId}`);

      const md5 = DeduplicationService.calculateMd5(buffer);
      const dHash = await DeduplicationService.computeDHash(buffer);
      const pHash = await DeduplicationService.computePHash(buffer);

      photoEntries.push({
        slotId: p.slotId,
        groupId: p.groupId,
        label: p.label,
        filename: `${payload.iasNo}_${p.slotId}.jpg`,
        fileBuffer: buffer,
        md5,
        dHash,
        pHash,
        capturedAt: p.capturedAt || new Date().toISOString(),
        isMock: p.isMock ?? true,
      });
    }

    // 2. Cross-check for photo collisions/fraud
    const collisionResult = DeduplicationService.checkCollisions(
      photoEntries,
      payload.iasNo,
      beneficiaryName,
      this.photoRegistry
    );

    if (collisionResult.isCompromised) {
      this.duplicatePairs.push(...collisionResult.duplicates);

      const qRecord: QuarantineRecord = {
        id: `q-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        iasNo: payload.iasNo,
        beneficiaryName,
        reasonCode: 'DUPLICATE_PHOTO_DETECTED',
        details: `Identical photo matched with unit ${collisionResult.duplicates[0].unit1}`,
        conflictingUnit: collisionResult.duplicates[0].unit1,
        createdAt: new Date().toISOString(),
        isResolved: false,
      };
      this.quarantineRecords.set(qRecord.id, qRecord);

      return {
        status: 'QUARANTINED',
        duplicates: collisionResult.duplicates,
        quarantineReasons: [qRecord.details],
      };
    }

    // 3. Register photos in global database
    for (const p of photoEntries) {
      this.photoRegistry.set(p.md5, {
        photo: p,
        iasNo: payload.iasNo,
        beneficiaryName,
      });
    }

    // 4. Mark approved
    this.generatedPdfs.push(`IRR_${payload.iasNo}.pdf`);

    return {
      status: 'APPROVED',
      duplicates: [],
    };
  }

  static getQuarantineList(): QuarantineRecord[] {
    return Array.from(this.quarantineRecords.values());
  }

  static resolveQuarantine(
    id: string,
    action: 'APPROVE_OVERRIDE' | 'REJECT_REQUEST_RETAKE',
    notes?: string
  ): QuarantineRecord | null {
    const record = this.quarantineRecords.get(id);
    if (!record) return null;

    record.isResolved = true;
    record.resolutionAction = `${action}: ${notes || 'Auditor processed'}`;
    return record;
  }

  /**
   * Generates mathematically balanced 100% accounting report
   */
  static getReconciliationReport(): ReconciliationReport {
    const masterUnits = ManifestService.getAllUnits();
    const totalSubmissions = this.submissions.size;
    const quarantinedCount = Array.from(this.quarantineRecords.values()).filter(
      (q) => !q.isResolved
    ).length;
    const approvedCount = this.generatedPdfs.length;

    const totalScansIn = totalSubmissions;
    const totalScansAccounted = approvedCount + quarantinedCount;

    return {
      timestamp: new Date().toISOString(),
      masterUnitsTotal: masterUnits.length,
      scans: {
        totalReceived: totalScansIn,
        matched: approvedCount,
        quarantined: quarantinedCount,
        balanceOk: totalScansAccounted === totalScansIn,
      },
      photoFolders: {
        totalReceived: totalSubmissions,
        matchedComplete: approvedCount,
        quarantined: quarantinedCount,
        balanceOk: totalScansAccounted === totalScansIn,
      },
      duplicatesDetected: {
        duplicatePairsCount: this.duplicatePairs.length,
        affectedUnits: Array.from(
          new Set(this.duplicatePairs.flatMap((d) => [d.unit1, d.unit2]))
        ),
        pairs: this.duplicatePairs,
      },
      pdfsGenerated: {
        count: approvedCount,
        files: this.generatedPdfs,
      },
      arithmeticBalance: {
        allBalanced: totalScansAccounted === totalScansIn,
        scansFormula: `${approvedCount} Approved + ${quarantinedCount} Quarantined = ${totalScansAccounted} / ${totalScansIn}`,
        photosFormula: `${approvedCount} Complete + ${quarantinedCount} Quarantined = ${totalScansAccounted} / ${totalScansIn}`,
      },
    };
  }
}
