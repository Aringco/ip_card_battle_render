'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { acornCard } from 'shared';
import { AcornCard, CardBack } from '@/components/game/acorn/AcornCard';
import { PlankButton } from '@/components/ui/PlankButton';
import { playRandomSound } from '@/lib/sounds';
import {
  RARITY_NAME, RARITY_RANK, displayTierOf, openPack, rarityOf, useAcornCollection, type OpenedCard, type PackRarity,
} from '@/lib/acornCollection';
import { PackArt, PackMouth, type MouthApi } from './CardsIcons';
import { CORNERS, FoldStrip, constrain, finishTarget, hoverPt, restPt, type FoldApi } from './FoldStrip';
import { OPEN_MAX, TEAR_PTS, VH, VW, shadeStops, type Pt } from './packGeometry';

/*
 * 도토리 증강팩 열기 — reference/card-pack-opening(로컬 참고 자료)의 흐름:
 *   ① 대기: 왼쪽 위 모서리가 살짝 들려 "잡을 수 있다"는 신호. 팩은 숨 쉬듯 떠 있고 포인터를 따라 기운다
 *   ② 뜯기: 모서리를 잡고 끌면 윗부분이 **스티커처럼 접히며** 뜯는 선을 따라 뜯긴다(FoldStrip — 수직이등분선 거울 반사)
 *   ③ 35% 넘게 뜯고 놓으면(72%면 놓지 않아도) 접는 선이 띠 밖으로 밀려나 끝까지 넘어가고, 띠가 커지며 떨어진다.
 *      입구에서 카드 5장이 올라오며 가장 높은 등급의 빛이 샌다
 *   ④ 팩이 떨어지고 카드가 뒷면인 채 펼쳐진다 — 뒷면에서 등급의 빛이 뿜어져 나온다(등급이 높을수록 세다)
 *   ⑤ 카드를 누르면 뒤집히며 그 등급의 빛이 터진다. 황금 이상은 잠깐 떨며 모았다가 뒤집힌다
 * 카드는 뜯기가 확정되는 순간 굴려 저장한다(openPack) — 뒤집기 전에 창을 닫아도 카드는 남는다.
 */

type Phase = 'idle' | 'tearing' | 'finishing' | 'torn' | 'rise' | 'drop' | 'fan' | 'reveal' | 'done';

/** 놓았을 때 끝까지 뜯어 주는 진행도 · 끌다가 여기까지 오면 놓지 않아도 끝까지(원본 데모의 값 — 팩 폭만큼 끌어도 접는 선 특성상 절반쯤만 뜯긴다) */
const AUTO_DONE = 0.35;
const DRAG_DONE = 0.72;
/** 이만큼 가까이 누르면 모서리를 바로 잡는다(그 밖을 누르면 끈 거리만큼 모서리를 옮긴다) */
const GRAB_R = 48;
/** 등급 낮은 것부터 · 가장 높은 카드를 가운데에 */
const SLOT_OF_ORDER = [0, 1, 3, 4, 2];

/** 몸통 — 띠와 **같은 톱니 점**(FoldStrip의 TEAR_PTS)을 %로 바꿔 자른다. 어긋나면 이음매가 벌어진다 */
const FRONT_CLIP = `polygon(${TEAR_PTS.map(p => `${((p[0] / VW) * 100).toFixed(2)}% ${((p[1] / VH) * 100).toFixed(2)}%`).join(', ')}, 100% 100%, 0% 100%)`;

type FoldMode = 'idle' | 'drag' | 'auto' | 'finishing' | 'off';
const AUTO_MS = 1100;

// ── 소리 — 뜯는 소리는 public/sounds/unpack.mp3(2026-11-28 요청 — 그 전에는 잡음을 걸러 합성했다), 뒤집기는 게임 효과음 ──
// 팩을 잡고 **움직이기 시작하는 순간** 한 번 낸다(2026-11-28 요청 — 그 전에는 뜯기가 확정될 때). 잡을 때마다 새로 한 번, [뜯기] 버튼은 누르는 순간.
const unpackSound = () => playRandomSound('unpack');
/** 뒤집는 소리(2026-11-28 요청) — 기본은 level_up, 좋은 카드(황금 · 다이아 · 무지개빛 — rank 3 이상)는 promotion 하나만 */
function flipSound(rank: number) {
  playRandomSound(rank >= 3 ? 'promotion' : 'level_up');
}
const buzz = (ms: number) => { try { navigator.vibrate?.(ms); } catch { /* 진동 없음 */ } };

const sleep = (ms: number) => new Promise<void>(r => window.setTimeout(r, ms));

/** 세로 폰 — 다섯 장을 한 줄로 펼치면 손톱만 해져서 두 줄(위 3 · 아래 2)로 놓는다(CSS의 같은 조건이 카드를 키운다) */
const PORTRAIT_QUERY = '(orientation: portrait) and (max-width: 640px)';
function usePortrait() {
  const [on, setOn] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia(PORTRAIT_QUERY);
    const sync = () => setOn(mq.matches);
    sync();
    mq.addEventListener('change', sync);
    return () => mq.removeEventListener('change', sync);
  }, []);
  return on;
}
/** 펼친 자리(카드 폭 단위) — 가운데(2)가 가장 높은 등급 */
function fanPos(slot: number, portrait: boolean) {
  const o = slot - 2;
  if (!portrait) return { kx: o * 1.16, ky: Math.abs(o) * 0.07 - 0.02, r: o * 4 };
  const P: Record<number, { kx: number; ky: number; r: number }> = {
    0: { kx: -1.1, ky: -0.78, r: -3 }, 2: { kx: 0, ky: -0.86, r: 0 }, 4: { kx: 1.1, ky: -0.78, r: 3 },
    1: { kx: -0.56, ky: 0.74, r: -2 }, 3: { kx: 0.56, ky: 0.74, r: 2 },
  };
  return P[slot];
}

interface Dealt extends OpenedCard { rarity: PackRarity; rank: number; slot: number; order: number }

export function PackOpener() {
  const col = useAcornCollection();
  const [phase, setPhase] = useState<Phase>('idle');
  const [dir, setDir] = useState<1 | -1>(1);
  const [dealt, setDealt] = useState<Dealt[] | null>(null);
  const [flipped, setFlipped] = useState<boolean[]>([]);
  const [charging, setCharging] = useState<number | null>(null);
  const [flash, setFlash] = useState<{ key: number; rarity: PackRarity } | null>(null);
  const [session, setSession] = useState(0);
  const [nudge, setNudge] = useState('');
  const portrait = usePortrait();

  const rigRef = useRef<HTMLDivElement>(null);
  const packRef = useRef<HTMLDivElement>(null);
  const foldApi = useRef<FoldApi>(null);
  const mouthApi = useRef<MouthApi>(null);
  const alive = useRef(true);
  const busy = useRef(false);
  const phaseRef = useRef<Phase>('idle');
  useEffect(() => { phaseRef.current = phase; }, [phase]);
  useEffect(() => {
    alive.current = true; // 개발 모드 StrictMode는 이펙트를 한 번 지웠다 다시 건다 — 다시 걸 때 되살린다
    return () => { alive.current = false; };
  }, []);

  /** 접기 상태 — 매 프레임 바뀌므로 React 상태가 아니라 ref(원본 데모의 G · Pc · Pt · pending · prog · O) */
  const fold = useRef({
    G: CORNERS[0] as Pt,
    Pc: [...CORNERS[0]] as Pt,
    Pt: restPt(CORNERS[0]),
    pending: null as Pt | null,
    mode: 'idle' as FoldMode,
    prog: 0,
    lastTick: 0,
    grab: null as null | { q0: Pt; p0: Pt; direct: boolean; sounded: boolean },
    autoT0: 0,
    autoTo: [0, 0] as Pt,
    /** 입구 벌어짐 */
    O: 0,
  });
  /** 보기 각도 · 빛 — 마우스로 가리키면 기울기 6° · 8°, 1.5초 손을 떼면 천천히 흔들린다(4° · 5°) */
  const view = useRef({ hx: 0, hy: 0, hoverAt: 0, rx: 0, ry: 0, light: 0, lightSet: NaN });

  const best = useMemo(() => (dealt ? dealt.reduce((a, b) => (b.rank > a.rank ? b : a)) : null), [dealt]);

  // ── ③~④ 뜯기가 확정된 뒤의 흐름 ──
  const finish = useCallback(async () => {
    if (busy.current) return;
    busy.current = true;
    const s = fold.current;
    const cards = openPack();
    if (!cards) {
      busy.current = false;
      s.mode = 'idle';
      s.Pt = restPt(s.G);
      setPhase('idle');
      return;
    }
    // 접는 방향을 유지한 채 접는 선을 띠 밖으로 밀어낸다 → 띠가 통째로 넘어간다
    s.mode = 'finishing';
    s.Pt = finishTarget(s.G, s.Pc);
    const sorted = cards
      .map((c, i) => { const def = acornCard(c.id)!; const rarity = rarityOf(def); return { ...c, rarity, rank: RARITY_RANK[rarity], i }; })
      .sort((a, b) => a.rank - b.rank || a.i - b.i);
    setDealt(sorted.map((c, order) => ({ id: c.id, isNew: c.isNew, rarity: c.rarity, rank: c.rank, order, slot: SLOT_OF_ORDER[order] })));
    setFlipped(sorted.map(() => false));
    setDir(s.G === CORNERS[0] ? 1 : -1);
    setPhase('finishing');
    buzz(20);
    await sleep(340);
    if (!alive.current) return;
    setPhase('torn');
    await sleep(380);
    if (!alive.current) return;
    s.mode = 'off';
    setPhase('rise');
    await sleep(1150);
    if (!alive.current) return;
    setPhase('drop');
    await sleep(420);
    if (!alive.current) return;
    setPhase('fan');
    await sleep(700);
    if (!alive.current) return;
    setPhase('reveal');
    busy.current = false;
  }, []);
  const finishRef = useRef(finish);
  useEffect(() => { finishRef.current = finish; }, [finish]);

  // ── 매 프레임: 접기(부드럽게 따라감) · 입구 벌어짐 · 보기 각도와 빛 ──
  useEffect(() => {
    let raf = 0;
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const sm = (x: number) => x * x * (3 - 2 * x);
    const tick = (t: number) => {
      const s = fold.current;
      const ph = phaseRef.current;
      if (s.mode === 'auto') {
        const k = Math.min(1, (performance.now() - s.autoT0) / AUTO_MS);
        const e = k < 0.5 ? 2 * k * k : 1 - (-2 * k + 2) ** 2 / 2;
        s.Pt = [s.G[0] + (s.autoTo[0] - s.G[0]) * e, s.G[1] + (s.autoTo[1] - s.G[1]) * e];
        if (k >= 1) void finishRef.current();
      }
      if (s.mode !== 'off') {
        if (s.pending && Math.hypot(s.Pc[0] - s.G[0], s.Pc[1] - s.G[1]) < 1.2) {
          s.G = s.pending;
          s.Pc = [s.G[0], s.G[1]];
          s.pending = null;
          s.Pt = hoverPt(s.G);
        }
        const k = s.mode === 'drag' ? 0.55 : s.mode === 'finishing' ? 0.28 : 0.22;
        s.Pc = [s.Pc[0] + (s.Pt[0] - s.Pc[0]) * k, s.Pc[1] + (s.Pt[1] - s.Pc[1]) * k];
        const api = foldApi.current;
        if (api) s.prog = api.render(s.G, s.Pc);
        if ((s.mode === 'drag' || s.mode === 'auto') && s.prog - s.lastTick >= 0.06) { s.lastTick = s.prog; buzz(6); }
        if (s.mode === 'drag' && s.prog >= DRAG_DONE) void finishRef.current();
      }
      // 입구 — 뜯는 중에는 뜯긴 만큼, 띠가 떨어질 때 실제 두께만큼, 카드가 나올 때는 OPEN_MAX
      const Ot = ph === 'finishing' || ph === 'torn' ? 1
        : ph === 'idle' || ph === 'tearing' ? sm(Math.min(1, s.prog * 1.7)) * 0.95
        : OPEN_MAX;
      s.O += (Ot - s.O) * 0.15;
      mouthApi.current?.render(s.O);
      // 보기 각도 · 빛(대기 중에만 기운다 — 뜯기 시작하면 곧바로 바로 세운다: 포인터 좌표가 어긋나지 않게)
      const v = view.current;
      let tx = 0;
      let ty = 0;
      let nx = 0;
      if (ph === 'idle' && !reduce) {
        if (v.hoverAt > 0 && t - v.hoverAt < 1500) { tx = v.hx * 8; ty = -v.hy * 6; nx = v.hx; }
        else { const sx = Math.sin(t / 1400) * 0.55; const sy = Math.cos(t / 1900) * 0.35; tx = sx * 5; ty = -sy * 4; nx = sx; }
        v.ry += (tx - v.ry) * 0.12;
        v.rx += (ty - v.rx) * 0.12;
      } else {
        v.rx = 0;
        v.ry = 0;
        nx = v.light;
      }
      v.light += (nx - v.light) * 0.12;
      const rig = rigRef.current;
      if (rig) rig.style.transform = Math.abs(v.rx) + Math.abs(v.ry) > 0.01 ? `perspective(900px) rotateX(${v.rx.toFixed(2)}deg) rotateY(${v.ry.toFixed(2)}deg)` : '';
      const pack = packRef.current;
      if (pack && Math.abs(v.light - v.lightSet) > 0.004 || (pack && Number.isNaN(v.lightSet))) {
        v.lightSet = v.light;
        pack!.style.setProperty('--tx', v.light.toFixed(3));
        shadeStops(v.light).forEach(([d, l], i) => {
          pack!.style.setProperty(`--sd${i}`, d.toFixed(3));
          pack!.style.setProperty(`--sl${i}`, l.toFixed(3));
        });
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  // ── ② 뜯기 — 모서리를 잡고 끈다 ──
  const canTear = phase === 'idle' && !!col && col.packs > 0;
  const svgPt = (e: React.PointerEvent): Pt => {
    const r = packRef.current!.getBoundingClientRect();
    return [((e.clientX - r.left) / r.width) * VW, ((e.clientY - r.top) / r.height) * VH];
  };
  const near = (q: Pt): Pt | null => {
    let bestC: Pt | null = null;
    let bd = GRAB_R;
    for (const c of CORNERS) { const d = Math.hypot(q[0] - c[0], q[1] - c[1]); if (d < bd) { bd = d; bestC = c; } }
    return bestC;
  };
  const dragTarget = (q: Pt): Pt => {
    const s = fold.current;
    const g = s.grab!;
    const p: Pt = g.direct ? q : [g.p0[0] + q[0] - g.q0[0], g.p0[1] + q[1] - g.q0[1]];
    return constrain(s.G, p);
  };
  const onPointerDown = (e: React.PointerEvent) => {
    if (!canTear || !packRef.current) return;
    e.preventDefault();
    const s = fold.current;
    const q = svgPt(e);
    const c = near(q);
    const corner = c ?? (q[0] < VW / 2 ? CORNERS[0] : CORNERS[1]);
    if (corner !== s.G) { s.G = corner; s.Pc = [corner[0], corner[1]]; s.pending = null; }
    // 모서리 가까이를 잡으면 모서리가 손가락을 따라오고, 그 밖을 잡으면 끈 거리만큼 모서리가 움직인다
    s.grab = { q0: q, p0: [s.Pc[0], s.Pc[1]], direct: !!c, sounded: false };
    s.mode = 'drag';
    s.lastTick = 0;
    s.Pt = dragTarget(q);
    view.current.hoverAt = 0;
    try { (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId); } catch { /* 이미 놓았다 */ }
    setNudge('');
    setPhase('tearing');
  };
  const onPointerMove = (e: React.PointerEvent) => {
    if (!packRef.current) return;
    const s = fold.current;
    const q = svgPt(e);
    if (s.mode === 'drag') {
      s.Pt = dragTarget(q);
      // 잡은 채 움직이기 시작한 순간 — 뜯는 소리(잡기만 하고 가만히 있으면 내지 않는다)
      const g = s.grab;
      if (g && !g.sounded && Math.hypot(q[0] - g.q0[0], q[1] - g.q0[1]) > 2) { g.sounded = true; unpackSound(); }
      return;
    }
    if (phase !== 'idle' || s.mode !== 'idle') return;
    if (e.pointerType === 'mouse') {
      const v = view.current;
      v.hx = Math.max(-1, Math.min(1, (q[0] - VW / 2) / (VW * 0.58)));
      v.hy = Math.max(-1, Math.min(1, (q[1] - VH / 2) / (VH * 0.55)));
      v.hoverAt = performance.now();
    }
    // 모서리를 가리키면 그 모서리가 더 들린다 — 다른 모서리로 옮길 때는 먼저 펴고 옮긴다
    const c = near(q);
    packRef.current.dataset.grab = c ? '1' : '';
    const want = c ?? CORNERS[0];
    if (want !== s.G && want !== s.pending) { s.pending = want; s.Pt = [s.G[0], s.G[1]]; }
    else if (!s.pending) s.Pt = c ? hoverPt(s.G) : restPt(s.G);
  };
  const onPointerLeave = () => {
    const s = fold.current;
    view.current.hoverAt = 0;
    if (s.mode !== 'idle') return;
    if (packRef.current) packRef.current.dataset.grab = '';
    if (s.G !== CORNERS[0]) { s.pending = CORNERS[0]; s.Pt = [s.G[0], s.G[1]]; }
    else s.Pt = restPt(s.G);
  };
  const release = () => {
    const s = fold.current;
    if (s.mode !== 'drag') return;
    s.grab = null;
    if (s.prog >= AUTO_DONE) { void finish(); return; }
    s.mode = 'idle';
    s.Pt = restPt(s.G);
    setNudge(s.prog > 0.05 ? '조금만 더 뜯어 보세요' : '모서리를 잡고 끌어 뜯어요');
    setPhase('idle');
  };
  /** [뜯기] · 스페이스 — 왼쪽 위 모서리를 오른쪽 아래로 끌어 준다(원본 데모의 자동 뜯기) */
  const autoTear = () => {
    if (!canTear) return;
    const s = fold.current;
    s.G = CORNERS[0];
    s.Pc = [s.G[0], s.G[1]];
    s.pending = null;
    s.lastTick = 0;
    s.autoT0 = performance.now();
    s.autoTo = [s.G[0] + 275, s.G[1] + 58];
    s.mode = 'auto';
    unpackSound();
    setNudge('');
    setPhase('tearing');
  };

  // ── ⑤ 뒤집기 ──
  const flipOne = useCallback(async (k: number) => {
    if (!dealt || flipped[k]) return;
    const c = dealt[k];
    if (c.rank >= 3) {
      setCharging(k);
      buzz(30);
      await sleep(c.rank >= 4 ? 700 : 450);
      if (!alive.current) return;
      setCharging(null);
    }
    setFlipped(f => { const n = f.slice(); n[k] = true; return n; });
    flipSound(c.rank);
    if (c.rank >= 4) { setFlash({ key: Date.now(), rarity: c.rarity }); buzz(45); }
  }, [dealt, flipped]);

  const [autoFlipping, setAutoFlipping] = useState(false);
  const flipAll = async () => {
    if (!dealt || autoFlipping) return;
    setAutoFlipping(true);
    for (let k = 0; k < dealt.length; k++) {
      if (!alive.current) return;
      if (flipped[k]) continue;
      await flipOne(k);
      await sleep(dealt[k].rank >= 3 ? 650 : 330);
    }
    setAutoFlipping(false);
  };

  // 다 뒤집으면 마무리
  useEffect(() => {
    if (phase !== 'reveal' || flipped.length === 0 || !flipped.every(Boolean)) return;
    const t = window.setTimeout(() => setPhase('done'), 700);
    return () => window.clearTimeout(t);
  }, [phase, flipped]);

  useEffect(() => {
    if (!flash) return;
    const t = window.setTimeout(() => setFlash(null), 1100);
    return () => window.clearTimeout(t);
  }, [flash]);

  const again = () => {
    const s = fold.current;
    s.G = CORNERS[0];
    s.Pc = [s.G[0], s.G[1]];
    s.Pt = restPt(s.G);
    s.pending = null;
    s.mode = 'idle';
    s.prog = 0;
    s.O = 0;
    view.current.lightSet = NaN;
    setDealt(null);
    setFlipped([]);
    setCharging(null);
    setNudge('');
    setSession(s => s + 1);
    setPhase('idle');
  };

  // 키보드 — 스페이스 · 엔터: 뜯기 / 모두 뒤집기 / 한 팩 더
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLElement && e.target.closest('button, a, input')) return;
      if (e.key !== ' ' && e.key !== 'Enter') return;
      e.preventDefault();
      if (phase === 'idle') autoTear();
      else if (phase === 'reveal') void flipAll();
      else if (phase === 'done' && col && col.packs > 0) again();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  if (!col) return <section className="opener" />;

  const packGone = phase === 'drop' || phase === 'fan' || phase === 'reveal' || phase === 'done';
  const cardsOut = phase === 'fan' || phase === 'reveal' || phase === 'done';
  const showPack = !(phase === 'idle' && col.packs <= 0);
  const newCount = dealt?.filter(c => c.isNew).length ?? 0;

  return (
    <section className="opener" data-phase={phase} data-shake={flash?.rarity === 'rainbow' ? '' : undefined} key={`s${session}`}>
      <div className="opener-stage">
        {showPack ? (
          <div className="pk-rig" ref={rigRef}>
            {!packGone && (
              <div
                ref={packRef}
                className="pk"
                data-dir={dir}
                data-best={best?.rarity}
                onPointerDown={onPointerDown}
                onPointerMove={onPointerMove}
                onPointerUp={release}
                onPointerCancel={release}
                onPointerLeave={onPointerLeave}
                role="img"
                aria-label="도토리 증강팩 — 위 모서리를 잡고 끌어 뜯어요"
              >
                <PackMouth apiRef={mouthApi} />
                <div className="pk-mouth-glow" />
                <div className="pk-front" style={{ clipPath: FRONT_CLIP }}><PackArt className="pk-art" /></div>
                <div className="pk-strip" data-fly={phase === 'torn' ? '' : undefined}>
                  <FoldStrip apiRef={foldApi} />
                </div>
              </div>
            )}
            {packGone && <div className="pk pk-falling" data-dir={dir}><PackMouth o={OPEN_MAX} /><div className="pk-front" style={{ clipPath: FRONT_CLIP }}><PackArt className="pk-art" /></div></div>}

            {dealt?.map((c, k) => {
              const o = c.slot - 2;
              const inPack = phase === 'idle' || phase === 'tearing' || phase === 'finishing' || phase === 'torn';
              const pos = cardsOut
                ? fanPos(c.slot, portrait)
                : inPack
                  ? { kx: (c.slot - 2) * 0.015, ky: 0.08, r: (c.slot - 2) * 1.2 }
                  : { kx: (c.slot - 2) * 0.05, ky: -0.92 - (c.slot === 2 ? 0.08 : 0), r: (c.slot - 2) * 2 };
              const def = acornCard(c.id)!;
              return (
                <button
                  key={c.id + k}
                  type="button"
                  className="pk-card"
                  data-rarity={c.rarity}
                  data-flipped={flipped[k] ? '' : undefined}
                  data-charging={charging === k ? '' : undefined}
                  data-out={cardsOut ? '' : undefined}
                  disabled={phase !== 'reveal' || flipped[k] || charging !== null || autoFlipping}
                  onClick={() => void flipOne(k)}
                  aria-label={flipped[k] ? `${def.name} — ${RARITY_NAME[c.rarity]}${c.isNew ? ' (새 카드)' : ''}` : `${k + 1}번째 카드 뒤집기`}
                  style={{
                    ['--kx' as string]: pos.kx,
                    ['--ky' as string]: pos.ky,
                    ['--r' as string]: `${pos.r}deg`,
                    ['--i' as string]: c.slot,
                    zIndex: cardsOut ? 10 + (c.slot === 2 ? 5 : 4 - Math.abs(o)) : 2,
                  } as React.CSSProperties}
                >
                  <span className="pk-aura" aria-hidden="true" />
                  <span className="pk-flip">
                    <span className="pk-face pk-face-back"><CardBack glow={c.rarity} /></span>
                    <span className="pk-face pk-face-front"><AcornCard id={c.id} tier={displayTierOf(def)} /></span>
                  </span>
                  {flipped[k] && <Burst rarity={c.rarity} rank={c.rank} />}
                  {flipped[k] && c.isNew && <span className="pk-new">NEW</span>}
                </button>
              );
            })}
          </div>
        ) : (
          <div className="opener-empty">
            <p>열 수 있는 도토리 증강팩이 없어요.</p>
            <Link href="/cards/shop" className="plank-button">상점에서 팩 사기</Link>
          </div>
        )}
        {flash && <div key={flash.key} className="opener-flash" data-rarity={flash.rarity} aria-hidden="true" />}
      </div>

      <div className="opener-bar" aria-live="polite">
        {phase === 'idle' && showPack && (
          <>
            <span className="opener-msg">{nudge || `위 모서리를 잡고 끌어 뜯어요 · 남은 팩 ${col.packs}개`}</span>
            <PlankButton onClick={autoTear}>뜯기</PlankButton>
          </>
        )}
        {phase === 'reveal' && (
          <>
            <span className="opener-msg">카드를 눌러 뒤집어요</span>
            <PlankButton onClick={() => void flipAll()} disabled={autoFlipping}>모두 뒤집기</PlankButton>
          </>
        )}
        {phase === 'done' && dealt && (
          <>
            <span className="opener-msg">
              {newCount > 0 ? `새 카드 ${newCount}장! · ` : ''}최고 등급 <b data-rarity={best?.rarity}>{best ? RARITY_NAME[best.rarity] : ''}</b>
            </span>
            {col.packs > 0 ? (
              <PlankButton onClick={again}>한 팩 더 열기 ({col.packs})</PlankButton>
            ) : (
              <Link href="/cards/shop" className="plank-button">상점에서 팩 사기</Link>
            )}
            <Link href="/cards" className="plank-button">갤러리 북</Link>
          </>
        )}
      </div>
    </section>
  );
}

/** 뒤집는 순간 카드에서 그 등급의 빛이 터진다 — 섬광 · 고리 · (황금 이상) 빛살 · 불티 */
function Burst({ rarity, rank }: { rarity: PackRarity; rank: number }) {
  const sparks = useMemo(() => {
    const n = [0, 8, 12, 18, 24, 30][rank];
    return Array.from({ length: n }, (_, i) => ({
      a: (i / n) * 360 + Math.random() * (360 / n),
      d: 0.7 + Math.random() * (0.5 + rank * 0.18),
      s: 0.5 + Math.random() * 0.8,
      t: 0.6 + Math.random() * 0.5,
    }));
  }, [rank]);
  return (
    <span className="pk-burst" data-rarity={rarity} aria-hidden="true">
      <span className="pk-burst-flash" />
      <span className="pk-burst-ring" />
      {rank >= 3 && <span className="pk-burst-rays" />}
      {sparks.map((s, i) => (
        <span
          key={i}
          className="pk-spark"
          style={{ ['--a' as string]: `${s.a}deg`, ['--d' as string]: s.d, ['--s' as string]: s.s, ['--t' as string]: `${s.t}s` } as React.CSSProperties}
        />
      ))}
    </span>
  );
}
