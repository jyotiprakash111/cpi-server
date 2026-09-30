import crypto from 'crypto';
import sharp from 'sharp';
import { DuplicateMatch, PhotoEntry } from '../types/index.js';

function dct1D(vec: number[]): number[] {
  const N = vec.length;
  const out = new Array(N);
  for (let k = 0; k < N; k++) {
    let sum = 0;
    for (let n = 0; n < N; n++) {
      sum += vec[n] * Math.cos((Math.PI / N) * (n + 0.5) * k);
    }
    out[k] = sum;
  }
  return out;
}

function dct2D(matrix: number[][], size: number): number[][] {
  const rows = matrix.map((r) => dct1D(r));
  const cols = new Array(size).fill(0).map(() => new Array(size));
  for (let c = 0; c < size; c++) {
    const colVec = rows.map((r) => r[c]);
    const dctCol = dct1D(colVec);
    for (let r = 0; r < size; r++) {
      cols[r][c] = dctCol[r];
    }
  }
  return cols;
}

export class DeduplicationService {
  /**
   * Layer 1: Calculates standard MD5 hash for exact byte matching (O(1))
   */
  static calculateMd5(buffer: Buffer): string {
    return crypto.createHash('md5').update(buffer).digest('hex');
  }

  /**
   * Layer 2: Computes 64-bit 2D DCT Perceptual Hash (Frequency Domain)
   * Invariant to image scaling (e.g. 640x480 -> 600x450), recompression & aspect ratio shifts
   */
  static async computePHash(imageBuffer: Buffer): Promise<string> {
    try {
      const size = 32;
      const { data } = await sharp(imageBuffer)
        .resize(size, size, { fit: 'fill' })
        .grayscale()
        .raw()
        .toBuffer({ resolveWithObject: true });

      const matrix: number[][] = [];
      for (let r = 0; r < size; r++) {
        const row: number[] = [];
        for (let c = 0; c < size; c++) {
          row.push(data[r * size + c]);
        }
        matrix.push(row);
      }

      const dct = dct2D(matrix, size);

      // Extract 8x8 low frequency DCT coefficients (excluding DC component at [0,0])
      const lowFreq: number[] = [];
      for (let r = 0; r < 8; r++) {
        for (let c = 0; c < 8; c++) {
          if (r === 0 && c === 0) continue;
          lowFreq.push(dct[r][c]);
        }
      }

      const sorted = [...lowFreq].sort((a, b) => a - b);
      const median = sorted[Math.floor(sorted.length / 2)];

      let hash = '';
      for (const v of lowFreq) {
        hash += v > median ? '1' : '0';
      }
      return BigInt('0b' + hash).toString(16).padStart(16, '0');
    } catch {
      return this.calculateMd5(imageBuffer).slice(0, 16);
    }
  }

  /**
   * Layer 3: Computes 512-bit Dual Bidirectional dHash (16x16 Horizontal + Vertical gradients)
   * Spatial gradient sensitivity to resolve flat/homogeneous scenes (e.g. lights_accessories)
   */
  static async computeDHash(imageBuffer: Buffer): Promise<string> {
    try {
      // 1. Horizontal Gradients (17x16 sample -> 256 bits)
      const { data: dataH } = await sharp(imageBuffer)
        .resize(17, 16, { fit: 'fill' })
        .grayscale()
        .raw()
        .toBuffer({ resolveWithObject: true });

      let hashH = '';
      for (let row = 0; row < 16; row++) {
        for (let col = 0; col < 16; col++) {
          hashH += dataH[row * 17 + col] > dataH[row * 17 + col + 1] ? '1' : '0';
        }
      }

      // 2. Vertical Gradients (16x17 sample -> 256 bits)
      const { data: dataV } = await sharp(imageBuffer)
        .resize(16, 17, { fit: 'fill' })
        .grayscale()
        .raw()
        .toBuffer({ resolveWithObject: true });

      let hashV = '';
      for (let row = 0; row < 16; row++) {
        for (let col = 0; col < 16; col++) {
          hashV += dataV[row * 16 + col] > dataV[(row + 1) * 16 + col] ? '1' : '0';
        }
      }

      // Concatenate 256-bit H + 256-bit V = 512-bit hex string (128 hex chars)
      const hexH = BigInt('0b' + hashH).toString(16).padStart(64, '0');
      const hexV = BigInt('0b' + hashV).toString(16).padStart(64, '0');
      return hexH + hexV;
    } catch {
      return this.calculateMd5(imageBuffer).repeat(4).slice(0, 128);
    }
  }

  /**
   * Calculates Hamming Distance between hex hash strings
   */
  static hammingDistance(hash1: string, hash2: string): number {
    try {
      let count = 0;
      const chunkSize = 16; // 64 bits per chunk
      for (let i = 0; i < hash1.length; i += chunkSize) {
        const chunk1 = hash1.slice(i, i + chunkSize);
        const chunk2 = hash2.slice(i, i + chunkSize);
        let xor = BigInt('0x' + chunk1) ^ BigInt('0x' + chunk2);
        while (xor > 0n) {
          if (xor & 1n) count++;
          xor >>= 1n;
        }
      }
      return count;
    } catch {
      return hash1 === hash2 ? 0 : 512;
    }
  }

  /**
   * Multi-Scale Slot-Aware Collision Checker
   * Evaluates Layer 1 (MD5), Layer 2 (DCT pHash <= 4), and Layer 3 (Dual dHash <= 10)
   */
  static checkCollisions(
    incoming: PhotoEntry[],
    iasNo: string,
    beneficiaryName: string,
    registry: Map<string, { photo: PhotoEntry; iasNo: string; beneficiaryName: string }>
  ): { duplicates: DuplicateMatch[]; isCompromised: boolean } {
    const duplicates: DuplicateMatch[] = [];
    const MAX_PHASH_DISTANCE_64 = 4; // Frequency-domain variance threshold (< 6.25%)
    const MAX_DHASH_DISTANCE_512 = 10; // Spatial gradient variance threshold (< 2.0%)

    for (const p of incoming) {
      // 1. Layer 1: Exact MD5 check (O(1))
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

      // 2. Cross-check against all registered photos within the same functional slot
      for (const [_, item] of registry.entries()) {
        if (item.iasNo !== iasNo) {
          const isSameSlot = item.photo.slotId === p.slotId || item.photo.label === p.label;
          if (!isSameSlot) continue;

          // Layer 2: 64-bit DCT pHash check (Rescaled/Recompressed duplicates)
          if (item.photo.pHash && p.pHash) {
            const pDist = this.hammingDistance(item.photo.pHash, p.pHash);
            if (pDist <= MAX_PHASH_DISTANCE_64) {
              if (!duplicates.some((d) => d.unit1 === item.iasNo && d.photo2 === p.filename)) {
                duplicates.push({
                  photo1: item.photo.filename,
                  unit1: item.iasNo,
                  beneficiary1: item.beneficiaryName,
                  photo2: p.filename,
                  unit2: iasNo,
                  beneficiary2: beneficiaryName,
                  hashType: 'PHASH_DCT_SIMILAR',
                  hammingDistance: pDist,
                });
              }
            }
          }

          // Layer 3: 512-bit Dual dHash check (Spatial gradient correlation)
          if (item.photo.dHash && p.dHash) {
            const dDist = this.hammingDistance(item.photo.dHash, p.dHash);
            if (dDist <= MAX_DHASH_DISTANCE_512) {
              if (!duplicates.some((d) => d.unit1 === item.iasNo && d.photo2 === p.filename)) {
                duplicates.push({
                  photo1: item.photo.filename,
                  unit1: item.iasNo,
                  beneficiary1: item.beneficiaryName,
                  photo2: p.filename,
                  unit2: iasNo,
                  beneficiary2: beneficiaryName,
                  hashType: 'DHASH_SPATIAL_SIMILAR',
                  hammingDistance: dDist,
                });
              }
            }
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

