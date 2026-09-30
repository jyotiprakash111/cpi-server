import { DeduplicationService } from '../src/services/deduplication.service.js';
import { ManifestService } from '../src/services/manifest.service.js';
import { ReconciliationService } from '../src/services/reconciliation.service.js';
import { PdfService } from '../src/services/pdf.service.js';
import { SyncBatchPayload } from '../src/types/index.js';

async function runBackendTestSuite() {
  console.log('=== STARTING CPI NODE.JS BACKEND TEST SUITE ===\n');

  let passed = 0;
  let failed = 0;

  function assert(condition: boolean, msg: string) {
    if (condition) {
      console.log(`✅ PASS: ${msg}`);
      passed++;
    } else {
      console.error(`❌ FAIL: ${msg}`);
      failed++;
    }
  }

  // 1. Manifest Lookup & Fuzzy Matching
  console.log('--- 1. MANIFEST SERVICE TESTS ---');
  const unit1 = ManifestService.findUnitByIas('IAS-1042');
  assert(unit1 !== undefined && unit1.beneficiaryName === 'Juan Dela Cruz', 'Found unit IAS-1042 (Juan Dela Cruz)');

  const searchRes = ManifestService.searchUnits('Juan Dela');
  assert(searchRes.length > 0 && searchRes[0].unit.iasNo === 'IAS-1042', 'Fuzzy name search for "Juan Dela" matches IAS-1042');

  // 2. Hash & Hamming Distance Tests
  console.log('\n--- 2. HASH & DEDUPLICATION TESTS ---');
  const bufferA = Buffer.from('unique_photo_sample_data_for_solar_panel_123');
  const bufferB = Buffer.from('unique_photo_sample_data_for_solar_panel_123'); // identical
  const bufferC = Buffer.from('different_photo_for_another_beneficiary_999');

  const md5A = DeduplicationService.calculateMd5(bufferA);
  const md5B = DeduplicationService.calculateMd5(bufferB);
  const md5C = DeduplicationService.calculateMd5(bufferC);

  assert(md5A === md5B, 'Identical buffers produce identical MD5 hashes');
  assert(md5A !== md5C, 'Different buffers produce distinct MD5 hashes');

  const distExact = DeduplicationService.hammingDistance('ffff0000ffff0000', 'ffff0000ffff0000');
  assert(distExact === 0, 'Identical 64-bit dHashes have Hamming distance 0');

  const distSmall = DeduplicationService.hammingDistance('ffff0000ffff0000', 'ffff0000ffff0001'); // 1 bit diff
  assert(distSmall === 1, '1-bit difference produces Hamming distance 1 (Duplicate / Minor Compression)');

  // 3. Ingestion & Duplicate Quarantine Test
  console.log('\n--- 3. MOBILE BATCH SYNC & QUARANTINE TESTS ---');
  const submission1: SyncBatchPayload = {
    submissionUuid: 'sub-uuid-1',
    iasNo: 'IAS-1042',
    deviceId: 'DEV-IPHONE-1',
    engineerId: 'ENG-JUAN',
    schemaVersion: '1.0.0',
    submittedAt: new Date().toISOString(),
    formData: {
      contractorMobilisedDate: '2026-09-27',
      solarFoundationStartDate: '2026-09-28',
      solarFoundationEndDate: '2026-09-29',
      panelCapacity: 580,
      numberOfSolarPanels: 20,
    },
    photos: [
      {
        slotId: 'excavation',
        groupId: 'foundationPhotos',
        label: 'Foundation: Excavation',
        capturedAt: new Date().toISOString(),
        base64Data: bufferA.toString('base64'),
      },
    ],
  };

  const res1 = await ReconciliationService.processSubmission(submission1);
  assert(res1.status === 'APPROVED', 'First unique submission for IAS-1042 is APPROVED');

  // Second submission reusing the exact same excavation photo from Unit 1
  const submission2: SyncBatchPayload = {
    submissionUuid: 'sub-uuid-2',
    iasNo: 'IAS-1089',
    deviceId: 'DEV-ANDROID-2',
    engineerId: 'ENG-PEDRO',
    schemaVersion: '1.0.0',
    submittedAt: new Date().toISOString(),
    formData: {
      contractorMobilisedDate: '2026-09-28',
      solarFoundationStartDate: '2026-09-29',
      solarFoundationEndDate: '2026-09-29',
    },
    photos: [
      {
        slotId: 'excavation',
        groupId: 'foundationPhotos',
        label: 'Foundation: Excavation',
        capturedAt: new Date().toISOString(),
        base64Data: bufferA.toString('base64'), // REUSED PHOTO FROM IAS-1042
      },
    ],
  };

  const res2 = await ReconciliationService.processSubmission(submission2);
  assert(res2.status === 'QUARANTINED', 'Second submission reusing photo is QUARANTINED');
  assert(res2.duplicates.length > 0 && res2.duplicates[0].unit1 === 'IAS-1042', 'Quarantine specifies collision with IAS-1042');

  // 4. Balanced Accounting Reconciliation
  console.log('\n--- 4. ZERO-LOSS RECONCILIATION BALANCE ---');
  const recon = ReconciliationService.getReconciliationReport();
  assert(recon.scans.balanceOk === true, 'Scans balance is mathematically balanced (Approved + Quarantined = Total)');
  assert(recon.duplicatesDetected.duplicatePairsCount === 1, 'Duplicate pair accurately recorded in audit report');
  assert(recon.arithmeticBalance.allBalanced === true, 'Global zero-loss arithmetic balance confirmed');

  // 5. PDF Generation Test
  console.log('\n--- 5. PDF DOSSIER GENERATION ---');
  const pdfBuffer = await PdfService.generateIrrReport(unit1!, submission1.formData, [
    {
      slotId: 'excavation',
      groupId: 'foundationPhotos',
      label: 'Excavation',
      filename: 'IAS-1042_excavation.jpg',
      md5: md5A,
      dHash: 'ffff0000ffff0000',
      capturedAt: new Date().toISOString(),
      isMock: true,
    },
  ]);

  assert(pdfBuffer.length > 1000, `IRR PDF generated successfully (${pdfBuffer.length} bytes)`);
  assert(pdfBuffer.slice(0, 4).toString() === '%PDF', 'Output buffer is a valid PDF-1.4 file');

  console.log('\n========================================');
  console.log(`TEST RESULTS: ${passed} PASSED, ${failed} FAILED`);
  console.log('========================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

runBackendTestSuite().catch((err) => {
  console.error('Test execution failed:', err);
  process.exit(1);
});
