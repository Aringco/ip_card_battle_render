import { PLAY_ASSETS } from '@/lib/playAssets';

/**
 * 도토리 그림(`icon_acorn.webp`) — 게임 화면의 🌰 이모지를 대신한다(2026-10-30).
 * 이모지 자리를 그대로 이어받도록 **높이 1em**이라 부모의 글자 크기를 따라간다(날아가는 도토리 3rem · 축제 폭죽 2.2rem 등 —
 * 예전 이모지 크기를 정하던 font-size를 그대로 쓴다). 꾸밈 그림이라 alt를 비우고 aria-hidden이다.
 */
export function AcornIcon({ className = '' }: { className?: string }) {
  return <img src={PLAY_ASSETS.iconAcorn} alt="" aria-hidden draggable={false} className={`acorn-icon ${className}`} />;
}
