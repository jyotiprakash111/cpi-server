import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import sharp from 'sharp';

interface PhotoInfo {
  folder: string;
  filename: string;
  fullPath: string;
  size: number;
  width?: number;
  height?: number;
  orientation?: number;
  md5: string;
  dHash8: string;
  dHash16: string;
  dHashHV8: string;
}

async function getDHash8(buffer: Buffer, transpose = false): Promise<string> {
  let img = sharp(buffer);
  if (transpose) {
    img = img.rotate(); // auto-rotate based on EXIF
  }
  const { data } = await img
    .resize(9, 8, { fit: 'fill' })
    .grayscale()
    .raw()
    .toBuffer({ resolveWithObject: true });

  let hash = '';
  for (let row = 0; row < 8; row++) {
    for (let col = 0; col < 8; col++) {
      hash += data[row * 9 + col] > data[row * 9 + col + 1] ? '1' : '0';
    }
  }
  return BigInt('0b' + hash).toString(16).padStart(16, '0');
}

async function getDHash16(buffer: Buffer, transpose = false): Promise<string> {
  let img = sharp(buffer);
  if (transpose) {
    img = img.rotate();
  }
  const { data } = await img
    .resize(17, 16, { fit: 'fill' })
    .grayscale()
    .raw()
    .toBuffer({ resolveWithObject: true });

  let hash = '';
  for (let row = 0; row < 16; row++) {
    for (let col = 0; col < 16; col++) {
      hash += data[row * 17 + col] > data[row * 17 + col + 1] ? '1' : '0';
    }
  }
  return BigInt('0b' + hash).toString(16).padStart(64, '0');
}

// Dual Horizontal + Vertical dHash
async function getDHashHV8(buffer: Buffer, transpose = false): Promise<string> {
  let img = sharp(buffer);
  if (transpose) {
    img = img.rotate();
  }
  // 9x9 gives 8x9 horizontal diffs and 9x8 vertical diffs = 72 + 72 = 144 bits
  const { data } = await img
    .resize(9, 9, { fit: 'fill' })
    .grayscale()
    .raw()
    .toBuffer({ resolveWithObject: true });

  let hashH = '';
  let hashV = '';
  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      hashH += data[r * 9 + c] > data[r * 9 + c + 1] ? '1' : '0';
      hashV += data[r * 9 + c] > data[(r + 1) * 9 + c] ? '1' : '0';
    }
  }
  const full = hashH + hashV; // 128 bits
  return BigInt('0b' + full).toString(16).padStart(32, '0');
}

function hamming(h1: string, h2: string): number {
  const b1 = BigInt('0x' + h1);
  const b2 = BigInt('0x' + h2);
  let xor = b1 ^ b2;
  let count = 0;
  while (xor > 0n) {
    if (xor & 1n) count++;
    xor >>= 1n;
  }
  return count;
}

async function main() {
  const photoDir = '/Users/apple/Downloads/CPI/CPI_IAS_Test_Dataset_v2/photo_files';
  const folders = fs.readdirSync(photoDir).filter(f => !f.startsWith('.'));

  const photos: PhotoInfo[] = [];

  for (const folder of folders) {
    const folderPath = path.join(photoDir, folder);
    const files = fs.readdirSync(folderPath).filter(f => !f.startsWith('.'));
    for (const file of files) {
      const fullPath = path.join(folderPath, file);
      const buf = fs.readFileSync(fullPath);
      const meta = await sharp(buf).metadata();
      const md5 = crypto.createHash('md5').update(buf).digest('hex');
      const dHash8 = await getDHash8(buf, false);
      const dHash16 = await getDHash16(buf, false);
      const dHashHV8 = await getDHashHV8(buf, false);

      photos.push({
        folder,
        filename: file,
        fullPath,
        size: buf.length,
        width: meta.width,
        height: meta.height,
        orientation: meta.orientation,
        md5,
        dHash8,
        dHash16,
        dHashHV8,
      });
    }
  }

  console.log(`Loaded ${photos.length} photos.`);

  // 1. Check exact MD5 matches
  console.log('\n=== EXACT MD5 MATCHES ===');
  let md5Matches = 0;
  for (let i = 0; i < photos.length; i++) {
    for (let j = i + 1; j < photos.length; j++) {
      if (photos[i].folder !== photos[j].folder && photos[i].md5 === photos[j].md5) {
        console.log(`MD5 Match: [${photos[i].folder}/${photos[i].filename}] == [${photos[j].folder}/${photos[j].filename}]`);
        md5Matches++;
      }
    }
  }
  if (md5Matches === 0) {
    console.log('No exact MD5 matches found across different folders.');
  }

  // 2. Analyze cross-site pairs using standard 64-bit dHash (thresholds 0, 1, 2, 3, 4, 5, etc.)
  console.log('\n=== DISTANCE DISTRIBUTION (64-bit dHash, cross-folder pairs) ===');
  const distCounts: Record<number, number> = {};
  const closePairs: { p1: PhotoInfo; p2: PhotoInfo; dist: number }[] = [];

  for (let i = 0; i < photos.length; i++) {
    for (let j = i + 1; j < photos.length; j++) {
      if (photos[i].folder === photos[j].folder) continue; // cross-site only
      const dist = hamming(photos[i].dHash8, photos[j].dHash8);
      distCounts[dist] = (distCounts[dist] || 0) + 1;
      if (dist <= 6) {
        closePairs.push({ p1: photos[i], p2: photos[j], dist });
      }
    }
  }

  const sortedDists = Object.keys(distCounts).map(Number).sort((a, b) => a - b);
  let cumulative = 0;
  for (const d of sortedDists) {
    cumulative += distCounts[d];
    if (d <= 15) {
      console.log(`Distance ${d}: count = ${distCounts[d]}, cumulative <= ${d} = ${cumulative}`);
    }
  }

  console.log(`\nTotal cross-site pairs at distance <= 4: ${closePairs.filter(p => p.dist <= 4).length}`);
  console.log(`Total cross-site pairs at distance <= 5: ${closePairs.filter(p => p.dist <= 5).length}`);
  console.log(`Total cross-site pairs at distance <= 6: ${closePairs.filter(p => p.dist <= 6).length}`);

  // Print all close pairs <= 3
  console.log('\n=== CLOSE PAIRS (dist <= 3) ===');
  for (const cp of closePairs.filter(p => p.dist <= 3)) {
    console.log(`Dist ${cp.dist}: [${cp.p1.folder}/${cp.p1.filename}] (${cp.p1.width}x${cp.p1.height}) <---> [${cp.p2.folder}/${cp.p2.filename}] (${cp.p2.width}x${cp.p2.height})`);
  }

  // Check distances with auto-transpose (EXIF orientation)
  console.log('\n=== TESTING WITH EXIF AUTO-TRANSPOSE ===');
  const photosTransposed: PhotoInfo[] = [];
  for (const p of photos) {
    const buf = fs.readFileSync(p.fullPath);
    const dHash8 = await getDHash8(buf, true);
    const dHash16 = await getDHash16(buf, true);
    const dHashHV8 = await getDHashHV8(buf, true);
    photosTransposed.push({ ...p, dHash8, dHash16, dHashHV8 });
  }

  const closePairsTransposed: { p1: PhotoInfo; p2: PhotoInfo; dist: number }[] = [];
  for (let i = 0; i < photosTransposed.length; i++) {
    for (let j = i + 1; j < photosTransposed.length; j++) {
      if (photosTransposed[i].folder === photosTransposed[j].folder) continue;
      const dist = hamming(photosTransposed[i].dHash8, photosTransposed[j].dHash8);
      if (dist <= 6) {
        closePairsTransposed.push({ p1: photosTransposed[i], p2: photosTransposed[j], dist });
      }
    }
  }

  console.log(`Transposed close pairs dist <= 4: ${closePairsTransposed.filter(p => p.dist <= 4).length}`);
  for (const cp of closePairsTransposed.filter(p => p.dist <= 2)) {
    console.log(`Transposed Dist ${cp.dist}: [${cp.p1.folder}/${cp.p1.filename}] <---> [${cp.p2.folder}/${cp.p2.filename}]`);
  }
}

main().catch(console.error);
