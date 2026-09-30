import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import sharp from 'sharp';

interface PhotoItem {
  id: string;
  folder: string;
  slot: string;
  filepath: string;
  filesize: number;
  width: number;
  height: number;
  md5: string;
  dHash_horizontal_8: string;
  dHash_vertical_8: string;
  dHash_dual_8: string;
  dHash_horizontal_16: string;
  dHash_vertical_16: string;
  dHash_dual_16: string;
}

// 1. Standard horizontal dHash (8x8 -> 9x8 sample)
async function computeDHashH8(buf: Buffer): Promise<string> {
  const { data } = await sharp(buf)
    .resize(9, 8, { fit: 'fill' })
    .grayscale()
    .raw()
    .toBuffer({ resolveWithObject: true });

  let hash = '';
  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      hash += data[r * 9 + c] > data[r * 9 + c + 1] ? '1' : '0';
    }
  }
  return BigInt('0b' + hash).toString(16).padStart(16, '0');
}

// 2. Vertical dHash (8x8 -> 8x9 sample)
async function computeDHashV8(buf: Buffer): Promise<string> {
  const { data } = await sharp(buf)
    .resize(8, 9, { fit: 'fill' })
    .grayscale()
    .raw()
    .toBuffer({ resolveWithObject: true });

  let hash = '';
  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      hash += data[r * 8 + c] > data[(r + 1) * 8 + c] ? '1' : '0';
    }
  }
  return BigInt('0b' + hash).toString(16).padStart(16, '0');
}

// 3. Dual (Horizontal + Vertical) 8x8 (128 bits)
async function computeDHashDual8(buf: Buffer): Promise<string> {
  const h = await computeDHashH8(buf);
  const v = await computeDHashV8(buf);
  return h + v;
}

// 4. Horizontal 16x16 (256 bits)
async function computeDHashH16(buf: Buffer): Promise<string> {
  const { data } = await sharp(buf)
    .resize(17, 16, { fit: 'fill' })
    .grayscale()
    .raw()
    .toBuffer({ resolveWithObject: true });

  let hash = '';
  for (let r = 0; r < 16; r++) {
    for (let c = 0; c < 16; c++) {
      hash += data[r * 17 + c] > data[r * 17 + c + 1] ? '1' : '0';
    }
  }
  return BigInt('0b' + hash).toString(16).padStart(64, '0');
}

// 5. Vertical 16x16 (256 bits)
async function computeDHashV16(buf: Buffer): Promise<string> {
  const { data } = await sharp(buf)
    .resize(16, 17, { fit: 'fill' })
    .grayscale()
    .raw()
    .toBuffer({ resolveWithObject: true });

  let hash = '';
  for (let r = 0; r < 16; r++) {
    for (let c = 0; c < 16; c++) {
      hash += data[r * 16 + c] > data[(r + 1) * 16 + c] ? '1' : '0';
    }
  }
  return BigInt('0b' + hash).toString(16).padStart(64, '0');
}

// 6. Dual 16x16 (512 bits)
async function computeDHashDual16(buf: Buffer): Promise<string> {
  const h = await computeDHashH16(buf);
  const v = await computeDHashV16(buf);
  return h + v;
}

function hamming(h1: string, h2: string): number {
  let count = 0;
  // If string length matches hex chars, chunk into 64-bit blocks
  const chunkSize = 16; // 16 hex chars = 64 bits
  for (let i = 0; i < h1.length; i += chunkSize) {
    const chunk1 = h1.slice(i, i + chunkSize);
    const chunk2 = h2.slice(i, i + chunkSize);
    let xor = BigInt('0x' + chunk1) ^ BigInt('0x' + chunk2);
    while (xor > 0n) {
      if (xor & 1n) count++;
      xor >>= 1n;
    }
  }
  return count;
}

async function run() {
  const photoDir = '/Users/apple/Downloads/CPI/CPI_IAS_Test_Dataset_v2/photo_files';
  const folders = fs.readdirSync(photoDir).filter((f) => !f.startsWith('.'));

  const allPhotos: PhotoItem[] = [];

  for (const folder of folders) {
    const folderPath = path.join(photoDir, folder);
    const files = fs.readdirSync(folderPath).filter((f) => !f.startsWith('.'));
    for (const file of files) {
      const fullPath = path.join(folderPath, file);
      const buf = fs.readFileSync(fullPath);
      const meta = await sharp(buf).metadata();
      const md5 = crypto.createHash('md5').update(buf).digest('hex');

      const dH8 = await computeDHashH8(buf);
      const dV8 = await computeDHashV8(buf);
      const dDual8 = await computeDHashDual8(buf);

      const dH16 = await computeDHashH16(buf);
      const dV16 = await computeDHashV16(buf);
      const dDual16 = await computeDHashDual16(buf);

      allPhotos.push({
        id: `${folder}/${file}`,
        folder,
        slot: file,
        filepath: fullPath,
        filesize: buf.length,
        width: meta.width || 0,
        height: meta.height || 0,
        md5,
        dHash_horizontal_8: dH8,
        dHash_vertical_8: dV8,
        dHash_dual_8: dDual8,
        dHash_horizontal_16: dH16,
        dHash_vertical_16: dV16,
        dHash_dual_16: dDual16,
      });
    }
  }

  console.log(`Loaded ${allPhotos.length} total photos across ${folders.length} units.`);

  // Check MD5 collisions
  console.log('\n--- EXACT MD5 DUPLICATE DETECTION ---');
  for (let i = 0; i < allPhotos.length; i++) {
    for (let j = i + 1; j < allPhotos.length; j++) {
      if (allPhotos[i].folder !== allPhotos[j].folder && allPhotos[i].md5 === allPhotos[j].md5) {
        console.log(`[MD5 EXACT MATCH] ${allPhotos[i].id} <===> ${allPhotos[j].id} (MD5: ${allPhotos[i].md5})`);
      }
    }
  }

  // Check 3 lights_accessories photos that had distance 0 in standard 64-bit dHash
  console.log('\n--- LIGHTS_ACCESSORIES 64-BIT dHASH COLLISION ANALYSIS ---');
  const lights = allPhotos.filter((p) => p.slot === 'lights_accessories.jpg');
  console.log(`Total lights_accessories photos: ${lights.length}`);

  const lightsHashGroups: Record<string, string[]> = {};
  for (const l of lights) {
    if (!lightsHashGroups[l.dHash_horizontal_8]) lightsHashGroups[l.dHash_horizontal_8] = [];
    lightsHashGroups[l.dHash_horizontal_8].push(l.folder);
  }

  for (const [h, fList] of Object.entries(lightsHashGroups)) {
    if (fList.length > 1) {
      console.log(`64-bit dHash "${h}" shared by ${fList.length} different folders:`);
      for (const f of fList) {
        console.log(`  - ${f}`);
      }
    }
  }

  // Compare distances between those 3 folders under Dual dHash (128-bit) and 16x16 Dual (512-bit)
  console.log('\n--- DISTANCES UNDER HIGHER RESOLUTION / DUAL GRADIENT HASHES ---');
  const targetFolders = Object.values(lightsHashGroups).find((fList) => fList.length >= 3) || [];
  if (targetFolders.length >= 2) {
    const p1 = lights.find((l) => l.folder === targetFolders[0])!;
    const p2 = lights.find((l) => l.folder === targetFolders[1])!;
    const p3 = targetFolders[2] ? lights.find((l) => l.folder === targetFolders[2])! : null;

    console.log(`Comparing ${p1.folder} vs ${p2.folder}:`);
    console.log(`  - 64-bit Horiz dHash distance:   ${hamming(p1.dHash_horizontal_8, p2.dHash_horizontal_8)} / 64`);
    console.log(`  - 64-bit Vert dHash distance:    ${hamming(p1.dHash_vertical_8, p2.dHash_vertical_8)} / 64`);
    console.log(`  - 128-bit Dual dHash distance:   ${hamming(p1.dHash_dual_8, p2.dHash_dual_8)} / 128`);
    console.log(`  - 256-bit Horiz dHash (16x16):   ${hamming(p1.dHash_horizontal_16, p2.dHash_horizontal_16)} / 256`);
    console.log(`  - 512-bit Dual dHash (16x16):    ${hamming(p1.dHash_dual_16, p2.dHash_dual_16)} / 512`);

    if (p3) {
      console.log(`Comparing ${p1.folder} vs ${p3.folder}:`);
      console.log(`  - 64-bit Horiz dHash distance:   ${hamming(p1.dHash_horizontal_8, p3.dHash_horizontal_8)} / 64`);
      console.log(`  - 64-bit Vert dHash distance:    ${hamming(p1.dHash_vertical_8, p3.dHash_vertical_8)} / 64`);
      console.log(`  - 128-bit Dual dHash distance:   ${hamming(p1.dHash_dual_8, p3.dHash_dual_8)} / 128`);
      console.log(`  - 256-bit Horiz dHash (16x16):   ${hamming(p1.dHash_horizontal_16, p3.dHash_horizontal_16)} / 256`);
      console.log(`  - 512-bit Dual dHash (16x16):    ${hamming(p1.dHash_dual_16, p3.dHash_dual_16)} / 512`);
    }
  }

  // Cross-site pairs distance distribution across all 7,380 pairs for:
  // (A) Standard 64-bit horizontal dHash
  // (B) 128-bit Dual dHash
  // (C) 256-bit 16x16 dHash
  // (D) 512-bit 16x16 Dual dHash
  // (E) Same-slot vs Cross-slot comparison
  console.log('\n--- TOTAL PAIRS DISTANCE DISTRIBUTION ANALYSIS (7,380 Cross-Site Pairs) ---');
  let totalCrossSitePairs = 0;
  const distCountsH8: Record<number, number> = {};
  const distCountsDual8: Record<number, number> = {};
  const distCountsDual16: Record<number, number> = {};

  for (let i = 0; i < allPhotos.length; i++) {
    for (let j = i + 1; j < allPhotos.length; j++) {
      if (allPhotos[i].folder === allPhotos[j].folder) continue;
      totalCrossSitePairs++;

      const dH8 = hamming(allPhotos[i].dHash_horizontal_8, allPhotos[j].dHash_horizontal_8);
      distCountsH8[dH8] = (distCountsH8[dH8] || 0) + 1;

      const dDual8 = hamming(allPhotos[i].dHash_dual_8, allPhotos[j].dHash_dual_8);
      distCountsDual8[dDual8] = (distCountsDual8[dDual8] || 0) + 1;

      const dDual16 = hamming(allPhotos[i].dHash_dual_16, allPhotos[j].dHash_dual_16);
      distCountsDual16[dDual16] = (distCountsDual16[dDual16] || 0) + 1;
    }
  }

  console.log(`Total cross-site pairs evaluated: ${totalCrossSitePairs}`);

  console.log('\n(A) 64-bit Horizontal dHash cumulative counts:');
  let cumH8 = 0;
  for (let d = 0; d <= 15; d++) {
    cumH8 += distCountsH8[d] || 0;
    console.log(`  Distance <= ${d}: count = ${cumH8} (${((cumH8 / totalCrossSitePairs) * 100).toFixed(2)}%)`);
  }

  console.log('\n(B) 128-bit Dual dHash cumulative counts:');
  let cumDual8 = 0;
  for (let d = 0; d <= 20; d++) {
    cumDual8 += distCountsDual8[d] || 0;
    console.log(`  Distance <= ${d}: count = ${cumDual8} (${((cumDual8 / totalCrossSitePairs) * 100).toFixed(2)}%)`);
  }

  console.log('\n(C) 512-bit Dual dHash (16x16) cumulative counts:');
  let cumDual16 = 0;
  for (let d = 0; d <= 30; d++) {
    cumDual16 += distCountsDual16[d] || 0;
    if (cumDual16 > 0 && d <= 20) {
      console.log(`  Distance <= ${d}: count = ${cumDual16} (${((cumDual16 / totalCrossSitePairs) * 100).toFixed(2)}%)`);
    }
  }

  // Same-slot vs Cross-slot analysis
  console.log('\n--- SAME-SLOT VS CROSS-SLOT COMPARISON ---');
  // Reused photo: Bacus vs Estrada recipient.jpg
  const bacus = allPhotos.find((p) => p.id === 'Bacus, Marites R./recipient.jpg')!;
  const estrada = allPhotos.find((p) => p.id === 'Estrada, Crispin S./recipient.jpg')!;
  console.log('True Positive Reused Photo: Bacus vs Estrada recipient.jpg');
  console.log(`  - MD5 match: ${bacus.md5 === estrada.md5}`);
  console.log(`  - 64-bit Horiz dHash distance: ${hamming(bacus.dHash_horizontal_8, estrada.dHash_horizontal_8)}`);
  console.log(`  - 128-bit Dual dHash distance:  ${hamming(bacus.dHash_dual_8, estrada.dHash_dual_8)}`);
  console.log(`  - 512-bit Dual 16x16 distance:  ${hamming(bacus.dHash_dual_16, estrada.dHash_dual_16)}`);
}

run().catch(console.error);
