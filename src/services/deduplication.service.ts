import crypto from 'crypto';
import sharp from 'sharp';
import { DuplicateMatch, PhotoEntry } from '../types/index.js';

export class DeduplicationService {
  /**
   * Calculates standard MD5 hash for exact byte matching
   */
  static calculateMd5(buffer: Buffer): string {
    return crypto.createHash('md5').update(buffer).digest('hex');
  }

  /**
   * Computes 64-bit visual difference hash (dHash) using Sharp
   * Resizes image to 9x8 grayscale and computes horizontal pixel gradient differences
   */
  static async computeDHash(imageBuffer: Buffer): Promise<string> {
    try {
      const { data } = await sharp(imageBuffer)
        .resize(9, 8, { fit: 'fill' })
        .grayscale()
        .raw()
        .toBuffer({ resolveWithObject: true });

      let hash = '';
      for (let row = 0; row < 8; row++) {
        for (let col = 0; col < 8; col++) {
          const leftPixel = data[row * 9 + col];
          const rightPixel = data[row * 9 + col + 1];
          hash += leftPixel > rightPixel ? '1' : '0';
        }
      }
      return BigInt('0b' + hash).toString(16).padStart(16, '0');
    } catch {
      // Fallback for mock/placeholder buffers
      return this.calculateMd5(imageBuffer).slice(0, 16);
    }
  }

  /**
   * Calculates Hamming Distance between two 64-bit hex hashes
   * Distance <= 4 denotes visually identical or cropped/re-compressed images
   */
  static hammingDistance(hash1: string, hash2: string): number {
    try {
      const val1 = BigInt('0x' + hash1);
      const val2 = BigInt('0x' + hash2);
      let xor = val1 ^ val2;
      let count = 0;
      while (xor > 0n) {
        if (xor & 1n) count++;
        xor >>= 1n;
      }
      return count;
    } catch {
      return hash1 === hash2 ? 0 : 64;
    }
  }

  /**
   * Cross-checks a set of photos against the global hash database
   */
  static checkCollisions(
    incoming: PhotoEntry[],
    iasNo: string,
    beneficiaryName: string,
    registry: Map<string, { photo: PhotoEntry; iasNo: string; beneficiaryName: string }>
  ): { duplicates: DuplicateMatch[]; isCompromised: boolean } {
    const duplicates: DuplicateMatch[] = [];

    for (const p of incoming) {
      // 1. Exact MD5 check
      if (registry.has(p.md5)) {
        const match = registry.get(p.md5)!;
        if (match.iasNo !== iasNo) {
          duplicates.push({
            photo1: match.photo.filename,
            unit1: match.iasNo,
            beneficiary1: match.beneficiaryName,
            photo2: p.filename,
            unit2: iasNo,
            beneficiary2: beneficiaryName,
            hashType: 'MD5_EXACT',
            hammingDistance: 0,
          });
        }
      }

      // 2. Perceptual dHash check
      for (const [_, item] of registry.entries()) {
        if (item.iasNo !== iasNo && item.photo.dHash && p.dHash) {
          const dist = this.hammingDistance(item.photo.dHash, p.dHash);
          if (dist <= 4 && !duplicates.some((d) => d.unit1 === item.iasNo && d.photo2 === p.filename)) {
            duplicates.push({
              photo1: item.photo.filename,
              unit1: item.iasNo,
              beneficiary1: item.beneficiaryName,
              photo2: p.filename,
              unit2: iasNo,
              beneficiary2: beneficiaryName,
              hashType: 'PHASH_SIMILAR',
              hammingDistance: dist,
            });
          }
        }
      }
    }

    return {
      duplicates,
      isCompromised: duplicates.length > 0,
    };
  }
}
