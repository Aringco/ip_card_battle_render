'use client';

import { useLayoutEffect, useState } from 'react';
import type { PlayerEmoticon } from '@/hooks/useAnimationQueue';

const SIZE = 180;
// 자리 간격은 이모티콘 크기보다 커야 한다 — 작으면 서로 겹쳐 뒤엣것이 가려진다.
const STACK_STEP = SIZE + 8;
// 앞의 것이 사라져 자리가 비면, 남은 것들이 이 시간에 걸쳐 위로 당겨 올라온다.
const REFLOW_MS = 260;

/**
 * 플레이어 프로필 옆에 뜨는 반응 이모티콘. 같은 사람에게 여러 개가 뜨면 **큐처럼**
 * 동작한다 — 새로 뜬 것은 아래로 한 칸씩 붙고, 맨 앞(가장 오래된) 것이 사라지면 뒤의
 * 것들이 한 칸씩 위로 딸려 올라온다.
 *
 * 그래서 자리 번호를 이모티콘이 만들어질 때 박아두지 않고 **매 렌더마다 현재 목록에서
 * 다시 센다.** 박아두면 앞엣것이 사라져도 뒤엣것은 제자리에 남아 중간이 텅 빈다.
 */
// ── 'left' 배치(개인전) ──────────────────────────────────────────────────────
// 풍선과 플레이어 칸 사이 간격 — 꼬리(뾰족한 부분)가 이 틈을 건너 플레이어를 가리킨다.
const BUBBLE_GAP = 22;
// 화면 가장자리에서 띄울 최소 여백
const VIEW_MARGIN = 8;
// 꼬리가 풍선의 둥근 모서리에 걸리지 않도록 위아래 끝에서 이만큼은 비운다
const TAIL_EDGE = 26;
// 플레이어가 고른 감정표현의 층 — 장소 타일의 안내 손(.place-guide-hand, 95)과 멈춤 화면(95~98)보다 위.
// 연출 표정(80)은 예전 그대로 둔다.
const EMOTE_Z = 99;

export function PlayerEmoticonLayer({
  items,
  placement = 'center',
}: {
  items: PlayerEmoticon[];
  /**
   * 'center'(팀전, 기본값) — 프로필의 보드 쪽(왼쪽 팀은 오른쪽, 오른쪽 팀은 왼쪽)에 붙인다.
   * 'left'(개인전) — 플레이어 칸의 **왼쪽**에 꼬리 달린 풍선으로 띄운다. 왼쪽이 화면 밖이면(왼쪽 열의 내 칸)
   *   오른쪽으로 넘기되 꼬리가 여전히 플레이어를 가리킨다. 아래로 넘치면 화면 안으로 끌어올리고 꼬리가
   *   플레이어 높이를 따라간다.
   */
  placement?: 'center' | 'left';
}) {
  // 앵커(팀:플레이어)별로 따로 줄을 세운다 — 서로 다른 사람의 이모티콘은 각자 0번부터.
  const keyOf = (it: PlayerEmoticon) => `${it.team}:${it.playerIndex}`;
  const slotOf = new Map<number, number>();
  const filled = new Map<string, number>();
  for (const it of items) {
    const key = keyOf(it);
    const slot = filled.get(key) ?? 0;
    slotOf.set(it.id, slot);
    filled.set(key, slot + 1);
  }

  return (
    <>
      {items.map(item => (
        placement === 'left'
          ? <SideBubble key={item.id} item={item} slot={slotOf.get(item.id) ?? 0} count={filled.get(keyOf(item)) ?? 1} />
          : <EmoticonBubble key={item.id} item={item} slot={slotOf.get(item.id) ?? 0} />
      ))}
    </>
  );
}

function EmoticonBubble({ item, slot }: { item: PlayerEmoticon; slot: number }) {
  const [anchor, setAnchor] = useState<{ x: number; y: number; onCenterSide: boolean } | null>(null);

  useLayoutEffect(() => {
    const el = document.querySelector(`[data-player-anchor="${item.team}:${item.playerIndex}"]`);
    if (!el) return;
    const r = el.getBoundingClientRect();
    // 왼쪽에 있는 프로필은 그 오른쪽(보드 쪽)에, 오른쪽에 있는 프로필은 그 왼쪽(보드 쪽)에 붙인다.
    // 팀 이름('A'/'B')이 아니라 **화면 위치**로 가른다 — 개인전은 편이 'p1'…이고, 내 편이 항상 왼쪽이다.
    // 팀전에서는 A가 왼쪽·B가 오른쪽이라 예전 판정과 똑같은 결과다.
    const onCenterSide = r.left + r.width / 2 < window.innerWidth / 2;
    setAnchor({
      x: onCenterSide ? r.right + 12 : r.left - 12,
      y: r.top + r.height / 2,
      onCenterSide,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [item.id]);

  if (!anchor) return null;
  const onCenterSide = anchor.onCenterSide;

  return (
    <span
      style={{
        position: 'fixed',
        left: anchor.x,
        top: anchor.y,
        // 좌우 정렬 + 세로 중앙 맞춤 위에, 큐에서의 자리만큼 아래로 내린다.
        // 자리 이동만 transition을 타므로(등장/퇴장 연출은 안쪽 img의 keyframes 담당),
        // 앞엣것이 사라지는 순간 나머지가 스르륵 위로 올라온다.
        transform: `translate(${onCenterSide ? '0' : '-100%'}, -50%) translateY(${slot * STACK_STEP}px)`,
        transition: `transform ${REFLOW_MS}ms ease-out`,
        zIndex: 80 + slot,
        pointerEvents: 'none',
      }}
    >
      <img
        src={item.src}
        alt=""
        // persist는 등장까지만 재생하고 그대로 멈춘다(페이드아웃 없음) — 제거 타이머도
        // 없어서, 화면이 종료 화면으로 넘어갈 때까지 그 표정 그대로 남는다.
        className={`player-emoticon${item.persist ? ' is-staying' : ''}`}
        style={{ width: SIZE, height: SIZE }}
      />
    </span>
  );
}

/**
 * 개인전 풍선의 크기. 상대 칸(.ind-opp-card)은 인원이 많아지면 상한(max-height)보다 줄어드는데, 풍선도 **그 비율만큼** 줄인다
 * (2026-10-28 요청 — 상대 7명의 풍선이 한꺼번에 떠도 모두 보이게). 한 사람에 풍선이 하나씩이므로, 이웃한 칸의 풍선끼리
 * 겹치지 않도록 칸 간격(칸 높이 + 사이 틈)도 넘지 않게 한다. 칸이 상한 그대로인(인원이 적은) 판과 내 정보창은 원래 크기다.
 */
function bubbleSizeFor(boxEl: Element, boxH: number): number {
  if (!boxEl.classList.contains('ind-opp-card')) return SIZE;
  const maxH = parseFloat(getComputedStyle(boxEl).maxHeight);
  if (!(maxH > 0) || boxH >= maxH - 0.5) return SIZE;
  const gap = boxEl.parentElement ? parseFloat(getComputedStyle(boxEl.parentElement).rowGap) || 0 : 0;
  return Math.round(Math.min(SIZE * (boxH / maxH), boxH + gap));
}

/**
 * 개인전의 이모티콘 — 플레이어 칸(`data-rabbit-target`이 달린 패널·상대 칸)의 왼쪽에 꼬리 달린 풍선으로 띄운다.
 * 칸 전체를 기준으로 삼는 이유: 닉네임(앵커) 바로 옆에 두면 180px 풍선이 그 사람의 칸을 덮어 체력·경험치가 가려진다.
 */
function SideBubble({ item, slot, count }: { item: PlayerEmoticon; slot: number; count: number }) {
  const [anchor, setAnchor] = useState<{ ay: number; boxLeft: number; boxRight: number; size: number } | null>(null);

  useLayoutEffect(() => {
    const el = document.querySelector(`[data-player-anchor="${item.team}:${item.playerIndex}"]`);
    if (!el) return;
    const boxEl = el.closest('[data-rabbit-target]') ?? el;
    const box = boxEl.getBoundingClientRect();
    const r = el.getBoundingClientRect();
    setAnchor({ ay: r.top + r.height / 2, boxLeft: box.left, boxRight: box.right, size: bubbleSizeFor(boxEl, box.height) });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [item.id]);

  if (!anchor) return null;
  const size = anchor.size;
  const step = size + 8;

  // 왼쪽에 다 들어가면 왼쪽, 아니면(화면 밖으로 나가면) 오른쪽. 어느 쪽이든 꼬리는 플레이어 쪽을 향한다.
  const side: 'left' | 'right' = anchor.boxLeft - BUBBLE_GAP - size >= VIEW_MARGIN ? 'left' : 'right';
  const x = side === 'left' ? anchor.boxLeft - BUBBLE_GAP : anchor.boxRight + BUBBLE_GAP;
  // 큐 자리만큼 아래로 내린다. 줄 전체(count칸)가 화면 아래로 넘치면 **줄의 첫 칸부터 끌어올린다** — 칸마다 따로
  // 화면 끝에 붙이면 아래쪽 풍선들이 한자리에 겹친다. 꼬리는 그래도 플레이어 높이를 가리킨다.
  const half = size / 2;
  const minY = VIEW_MARGIN + half;
  const maxY = (typeof window === 'undefined' ? 1080 : window.innerHeight) - VIEW_MARGIN - half;
  const firstY = Math.max(minY, Math.min(anchor.ay, maxY - (count - 1) * step));
  const y = Math.min(Math.max(firstY + slot * step, minY), maxY);
  const tailY = Math.min(Math.max(anchor.ay - y, -(half - TAIL_EDGE)), half - TAIL_EDGE);

  return (
    <span
      style={{
        position: 'fixed',
        left: x,
        top: y,
        transform: `translate(${side === 'left' ? '-100%' : '0'}, -50%)`,
        // 앞엣것이 사라지면 남은 것들이 스르륵 올라온다(자리는 top으로 잡으므로 top에 transition)
        transition: `top ${REFLOW_MS}ms ease-out`,
        zIndex: (item.emote ? EMOTE_Z : 80) + slot,
        pointerEvents: 'none',
      }}
    >
      {/* 등장·퇴장 연출은 풍선 전체(그림 + 꼬리)에 건다 — 그림에만 걸면 꼬리만 덩그러니 남는다.
          감정표현은 풍선(흰 상자 + 꼬리)이 제자리에 가만히 있고 **안의 그림만** 흔들린다 — 상자와 그림을 나눠 그린다. */}
      <span className={`emoticon-bubble${item.persist ? ' is-staying' : ''}${item.emote ? ' is-emote' : ''}`}>
        {item.emote ? (
          <span className="player-emoticon emote-box" style={{ width: size, height: size, padding: Math.round(size * 0.09) }}>
            <img src={item.src} alt="" className="emote-img" />
          </span>
        ) : (
          <img src={item.src} alt="" className="player-emoticon" style={{ width: size, height: size }} />
        )}
        <span
          aria-hidden
          className={`emoticon-tail emoticon-tail-${side === 'left' ? 'right' : 'left'}`}
          style={{ ['--tail-y' as string]: `${tailY}px` }}
        />
      </span>
    </span>
  );
}
