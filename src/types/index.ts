export interface ManifestUnit {
  id: string;
  iasNo: string;
  beneficiaryName: string;
  purok?: string;
  barangay: string;
  municipality: string;
  shsKitSn?: string;
  solarPanelSn?: string;
  latitude?: number;
  longitude?: number;
  electricCooperative?: string;
  normName: string;
}

export interface PhotoEntry {
  slotId: string;
  groupId: string;
  label: string;
  filename: string;
  fileBuffer?: Buffer;
  md5: string;
  dHash: string;
  capturedAt: string;
  isMock: boolean;
}

export interface SyncBatchPayload {
  submissionUuid: string;
  iasNo: string;
  deviceId: string;
  engineerId: string;
  schemaVersion: string;
  submittedAt: string;
  formData: Record<string, any>;
  photos: {
    slotId: string;
    groupId: string;
    label: string;
    capturedAt: string;
    base64Data?: string;
    uri?: string;
    isMock?: boolean;
  }[];
}

export interface DuplicateMatch {
  photo1: string;
  unit1: string;
  beneficiary1: string;
  photo2: string;
  unit2: string;
  beneficiary2: string;
  hashType: 'MD5_EXACT' | 'PHASH_SIMILAR';
  hammingDistance: number;
}

export interface QuarantineRecord {
  id: string;
  iasNo: string;
  beneficiaryName?: string;
  reasonCode: string;
  details: string;
  conflictingUnit?: string;
  createdAt: string;
  isResolved: boolean;
  resolutionAction?: string;
}

export interface ReconciliationReport {
  timestamp: string;
  masterUnitsTotal: number;
  scans: {
    totalReceived: number;
    matched: number;
    quarantined: number;
    balanceOk: boolean;
  };
  photoFolders: {
    totalReceived: number;
    matchedComplete: number;
    quarantined: number;
    balanceOk: boolean;
  };
  duplicatesDetected: {
    duplicatePairsCount: number;
    affectedUnits: string[];
    pairs: DuplicateMatch[];
  };
  pdfsGenerated: {
    count: number;
    files: string[];
  };
  arithmeticBalance: {
    allBalanced: boolean;
    scansFormula: string;
    photosFormula: string;
  };
}
