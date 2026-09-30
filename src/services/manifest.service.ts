import fs from 'fs';
import path from 'path';
import { ManifestUnit } from '../types/index.js';

export class ManifestService {
  private static units: ManifestUnit[] = [];

  static normalizeText(text: string): string {
    if (!text) return '';
    return text
      .replace(/\.(jpe?g|png|pdf)$/i, '')
      .replace(/[\-_,.]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .toLowerCase();
  }

  /**
   * Initializes master units cache
   */
  static loadUnits(customUnits?: ManifestUnit[]) {
    if (customUnits && customUnits.length > 0) {
      this.units = customUnits;
      return;
    }

    // Default sample manifest for development
    this.units = [
      {
        id: 'unit-1',
        iasNo: 'IAS-1042',
        beneficiaryName: 'Juan Dela Cruz',
        purok: 'Purok 3',
        barangay: 'San Jose',
        municipality: 'Puerto Princesa',
        shsKitSn: 'SHS-8821',
        solarPanelSn: 'PV-99124',
        electricCooperative: 'PALECO',
        normName: this.normalizeText('Juan Dela Cruz'),
      },
      {
        id: 'unit-2',
        iasNo: 'IAS-1089',
        beneficiaryName: 'Maria Santos',
        purok: 'Purok 1',
        barangay: 'Santa Monica',
        municipality: 'Puerto Princesa',
        shsKitSn: 'SHS-8822',
        solarPanelSn: 'PV-99125',
        electricCooperative: 'PALECO',
        normName: this.normalizeText('Maria Santos'),
      },
      {
        id: 'unit-3',
        iasNo: 'IAS-1150',
        beneficiaryName: 'Antonio Luna',
        purok: 'Purok Riverside',
        barangay: 'Irawan',
        municipality: 'Puerto Princesa',
        shsKitSn: 'SHS-8823',
        solarPanelSn: 'PV-99126',
        electricCooperative: 'PALECO',
        normName: this.normalizeText('Antonio Luna'),
      },
    ];
  }

  static getAllUnits(): ManifestUnit[] {
    if (this.units.length === 0) {
      this.loadUnits();
    }
    return this.units;
  }

  static findUnitByIas(iasNo: string): ManifestUnit | undefined {
    const cleanIas = iasNo.trim().toUpperCase();
    return this.getAllUnits().find((u) => u.iasNo.toUpperCase() === cleanIas);
  }

  static searchUnits(query: string): { unit: ManifestUnit; matchType: string; score: number }[] {
    const normQ = this.normalizeText(query);
    const results: { unit: ManifestUnit; matchType: string; score: number }[] = [];

    for (const u of this.getAllUnits()) {
      if (u.normName === normQ) {
        results.push({ unit: u, matchType: 'exact_name', score: 1.0 });
      } else if (u.iasNo.toLowerCase().includes(normQ) || normQ.includes(u.iasNo.toLowerCase())) {
        results.push({ unit: u, matchType: 'ias_no', score: 0.95 });
      } else if (u.normName.includes(normQ) || normQ.includes(u.normName)) {
        results.push({ unit: u, matchType: 'partial_name', score: 0.8 });
      }
    }

    return results.sort((a, b) => b.score - a.score);
  }
}
