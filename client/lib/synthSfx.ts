'use client';

import { getSfxVolume } from './audioSettings';

/**
 * 파일 없이 브라우저가 합성하는 짧은 효과음(Web Audio) — 목표점수 달성하기의 시작 룰렛(ScoreRaceIntro)에 쓴다.
 *
 * 왜 합성인가 — 룰렛 눈금은 한 판에 수십 번 울리고 간격이 55ms까지 좁아진다. 녹음 파일(<audio>)은 재생을 시작하는
 * 지연이 들쭉날쭉해 빠른 구간에서 소리가 뭉치고, 새 파일을 받으면 저작권·프리로드 목록(generateAssetManifest)까지
 * 챙겨야 한다. 합성음은 지연이 거의 없고 받을 것이 없다. 실제 녹음 소리로 바꾸고 싶으면 /public/sounds에 파일을 넣고
 * sounds.ts의 playRandomSound로 갈아 끼우면 된다(이 파일의 함수 두 개만 바꾸면 된다).
 *
 * 음량·끄기는 다른 효과음과 같은 설정을 따른다(getSfxVolume — 전체 × 효과음).
 *
 * ⚠️ 브라우저는 사용자가 페이지를 한 번 누르기 전에는 소리를 막는다(autoplay 정책). 룰렛은 로비에서 [도전하기]를 누른 뒤
 *    같은 문서 안에서(클라이언트 라우팅) 뜨므로 대개 울린다. 막혀 있으면 조용히 넘어간다 — 연출이 멈추지는 않는다.
 */

let ctx: AudioContext | null = null;

function audio(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  if (!ctx) {
    const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return null;
    try {
      ctx = new Ctor();
    } catch {
      return null;
    }
  }
  if (ctx.state === 'suspended') void ctx.resume().catch(() => {});
  return ctx;
}

/** 음 하나 — 빠르게 올라갔다 지수적으로 사라지는 짧은 소리 */
function tone(freq: number, startAt: number, durationSec: number, peak: number, type: OscillatorType): void {
  const ac = audio();
  if (!ac) return;
  const volume = getSfxVolume() * peak;
  if (volume <= 0) return;
  const t0 = ac.currentTime + startAt;
  const osc = ac.createOscillator();
  const gain = ac.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t0);
  gain.gain.setValueAtTime(0.0001, t0);
  gain.gain.exponentialRampToValueAtTime(volume, t0 + 0.005);
  gain.gain.exponentialRampToValueAtTime(0.0001, t0 + durationSec);
  osc.connect(gain).connect(ac.destination);
  osc.start(t0);
  osc.stop(t0 + durationSec + 0.02);
}

/**
 * 룰렛 눈금 '틱' — 숫자가 바뀔 때마다. progress(0~1)가 커질수록(돌기가 느려질수록) 음이 조금씩 낮아져
 * 멈춰 가는 느낌을 준다.
 */
export function playRouletteTick(progress = 0): void {
  const p = Math.min(1, Math.max(0, progress));
  tone(1500 - 500 * p, 0, 0.045, 0.22, 'square');
}

/** 목표에 멈췄을 때 '딩동' — 두 음을 차례로(도·미 위로 올라가는 음정) */
export function playRouletteLand(): void {
  tone(1046.5, 0, 0.35, 0.35, 'triangle');   // C6
  tone(1318.5, 0.11, 0.55, 0.35, 'triangle'); // E6
}
