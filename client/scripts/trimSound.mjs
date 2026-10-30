// MP3 앞부분만 잘라 쓰기 — 다시 인코딩하지 않고 **프레임 단위로** 자른다(인코더가 없어도 되고 음질이 그대로다).
//   cd client && node scripts/trimSound.mjs <원본.mp3> <결과.mp3> <초>
// 지금 쓰는 곳: 레벨업 효과음 — 받은 원본(5초)은 assets-src/sounds/level_up.mp3에 두고, 앞 1초만 public/sounds/level_up.mp3로 낸다(2026-10-31 요청).
//   node scripts/trimSound.mjs assets-src/sounds/level_up.mp3 public/sounds/level_up.mp3 1
// 끝이 뚝 끊기는 소리는 재생하는 쪽이 짧게 줄여 없앤다(lib/sounds.ts의 fadeOutMs).
// ⚠️ MPEG-1/2 Layer III만 다룬다. 원본 앞의 ID3 태그는 그대로 두고, VBR 길이표(Xing/Info) 프레임이 있으면 뺀다(잘린 길이와 어긋나므로).
import { readFileSync, writeFileSync } from 'node:fs';

const [src, dst, secArg] = process.argv.slice(2);
if (!src || !dst || !secArg) {
  console.error('사용법: node scripts/trimSound.mjs <원본.mp3> <결과.mp3> <초>');
  process.exit(1);
}
const seconds = Number(secArg);
const b = readFileSync(src);

const BITRATES = {
  1: [0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320], // MPEG-1 Layer III
  2: [0, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160], // MPEG-2/2.5 Layer III
};
const RATES = { 3: [44100, 48000, 32000], 2: [22050, 24000, 16000], 0: [11025, 12000, 8000] };

let o = 0;
if (b.subarray(0, 3).toString() === 'ID3') o = 10 + (((b[6] & 127) << 21) | ((b[7] & 127) << 14) | ((b[8] & 127) << 7) | (b[9] & 127));
const head = b.subarray(0, o);
const frames = [];
let samples = 0;
let rate = 0;
while (o + 4 <= b.length) {
  if (!(b[o] === 0xff && (b[o + 1] & 0xe0) === 0xe0)) { o++; continue; }
  const ver = (b[o + 1] >> 3) & 3; // 3 = MPEG-1, 2 = MPEG-2, 0 = MPEG-2.5
  const layer = (b[o + 1] >> 1) & 3; // 1 = Layer III
  const br = BITRATES[ver === 3 ? 1 : 2][(b[o + 2] >> 4) & 15];
  const sr = RATES[ver]?.[(b[o + 2] >> 2) & 3];
  if (layer !== 1 || !br || !sr) { o++; continue; }
  const pad = (b[o + 2] >> 1) & 1;
  const perFrame = ver === 3 ? 1152 : 576;
  const len = Math.floor(((ver === 3 ? 144 : 72) * br * 1000) / sr) + pad;
  const frame = b.subarray(o, o + len);
  const tag = frame.subarray(0, 64).toString('latin1');
  if (frames.length === 0 && (tag.includes('Xing') || tag.includes('Info'))) { o += len; continue; }
  frames.push(frame);
  samples += perFrame;
  rate = sr;
  o += len;
  if (samples >= seconds * sr) break;
}
writeFileSync(dst, Buffer.concat([head, ...frames]));
console.log(`[trim] ${dst} — ${frames.length}프레임 · ${(samples / rate).toFixed(3)}초 (${rate}Hz)`);
