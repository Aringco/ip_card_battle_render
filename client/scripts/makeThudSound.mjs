// 쿵 효과음(public/sounds/thud.wav) — 카드 강화 판에서 배율 높은 기술 카드를 내려찍을 때 울린다(SkillQuake.tsx).
// 받아 온 음원이 아니라 이 스크립트가 **직접 합성한다** — 출처·라이선스를 따질 것이 없다. 다시 만들려면:
//   cd client && node scripts/makeThudSound.mjs
// 구성: 높이가 빠르게 떨어지는 낮은 사인(몸통) + 더 낮은 서브 베이스 + 짧은 충격 잡음(부딪는 소리) + 갈색 잡음(흙이 울리는 꼬리).
// 무작위는 고정 시드라 몇 번을 돌려도 같은 파일이 나온다.
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const SR = 44100;
const DUR = 1.1;
const N = Math.floor(SR * DUR);

let seed = 0x5eed;
const rand = () => {
  seed = (seed * 1664525 + 1013904223) >>> 0;
  return seed / 0x100000000 * 2 - 1;
};

const out = new Float32Array(N);
let phase = 0;
let lp = 0; // 충격 잡음의 1차 저역 통과
let brown = 0;
for (let i = 0; i < N; i++) {
  const t = i / SR;
  const attack = Math.min(1, t / 0.004);
  // 몸통 — 115Hz에서 45Hz로 떨어지는 사인
  const f = 45 + 70 * Math.exp(-t / 0.06);
  phase += (2 * Math.PI * f) / SR;
  const body = Math.sin(phase) * Math.exp(-t / 0.28);
  const sub = Math.sin(2 * Math.PI * 38 * t) * Math.exp(-t / 0.45) * 0.5;
  lp += (rand() - lp) * 0.11;
  const hit = lp * Math.exp(-t / 0.025) * 2.4;
  brown = brown * 0.985 + rand() * 0.06;
  const rumble = brown * Math.exp(-t / 0.35) * 0.9;
  out[i] = attack * (body + sub + hit + rumble);
}

// 부드럽게 눌러 담고(tanh) 꼭대기를 0.9로 맞춘 뒤 끝 50ms를 잦아들게 한다
let peak = 0;
for (let i = 0; i < N; i++) {
  out[i] = Math.tanh(1.6 * out[i]) / Math.tanh(1.6);
  peak = Math.max(peak, Math.abs(out[i]));
}
const fade = Math.floor(SR * 0.05);
for (let i = 0; i < N; i++) {
  out[i] = (out[i] / peak) * 0.9;
  if (i > N - fade) out[i] *= (N - i) / fade;
}

// 16비트 모노 PCM WAV
const data = Buffer.alloc(N * 2);
for (let i = 0; i < N; i++) data.writeInt16LE(Math.round(Math.max(-1, Math.min(1, out[i])) * 32767), i * 2);
const header = Buffer.alloc(44);
header.write('RIFF', 0);
header.writeUInt32LE(36 + data.length, 4);
header.write('WAVE', 8);
header.write('fmt ', 12);
header.writeUInt32LE(16, 16);
header.writeUInt16LE(1, 20);
header.writeUInt16LE(1, 22);
header.writeUInt32LE(SR, 24);
header.writeUInt32LE(SR * 2, 28);
header.writeUInt16LE(2, 32);
header.writeUInt16LE(16, 34);
header.write('data', 36);
header.writeUInt32LE(data.length, 40);

const target = join(dirname(fileURLToPath(import.meta.url)), '..', 'public', 'sounds', 'thud.wav');
writeFileSync(target, Buffer.concat([header, data]));
console.log(`[thud] ${target} (${((44 + data.length) / 1024).toFixed(0)}KB)`);
