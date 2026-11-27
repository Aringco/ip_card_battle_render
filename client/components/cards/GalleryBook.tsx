'use client';

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { AcornCardDef } from 'shared';
import { ACORN_CARDS, ACORN_FAMILY_NAME } from 'shared';
import { AcornCard } from '@/components/game/acorn/AcornCard';
import { PLAY_ASSETS } from '@/lib/playAssets';
import {
  GALLERY_FAMILIES, RARITY_NAME, cardsOfFamily, displayTierOf, rarityOf, useAcornCollection, type GalleryFamily,
} from '@/lib/acornCollection';

/*
 * 갤러리 북 — 가운데 책등을 기준으로 왼쪽 · 오른쪽 두 쪽이 펼쳐진 책(쪽마다 카드 3열).
 *
 * ── 쪽 넘기기 = 스티커 접기 ─────────────────────────────────────────────────────────
 * 팩 뜯기(FoldStrip)와 같은 방식이다: 잡은 모서리 G가 포인터 P에 닿도록 종이를 접는다고 보면 접는 선은 GP의 수직이등분선이고,
 * 그 선의 G쪽(넘어가는 쪽)을 선에 대해 거울 반사해 그리면 넘어가는 종이의 뒷면이 된다. 다만 종이가 **책등에 묶여 있어**
 * P는 책등의 두 모서리에서 일정 거리 안에만 있을 수 있다(constrainP). 책등을 넘겨 놓으면 끝까지 넘어가고, 아니면 돌아온다.
 *
 * ── 뒷면을 바로 읽히게 그리는 법 ────────────────────────────────────────────────────
 * 넘어가는 종이의 뒷면은 "다 넘긴 뒤 왼쪽 쪽"이다. 그 내용을 **처음부터 왼쪽 쪽 자리에 바른 방향으로** 그려 두고,
 * 책등에 대한 반사(R_spine) → 접는 선에 대한 반사(R_fold)를 차례로 건다. 반사 두 번은 회전이라 글자 · 꼬리표가 뒤집히지 않는다.
 * 다 넘기면 접는 선이 곧 책등이 되어 두 반사가 서로 지워지고, 뒷면이 왼쪽 쪽 자리에 그대로 놓인다.
 *
 * ── 꼬리표 ──────────────────────────────────────────────────────────────────────────
 * 묶음(실용신양 · 상표토끼 · …)마다 그 묶음의 **첫 쪽(언제나 오른쪽 쪽)** 이 꼬리표를 단다. 넘기지 않은 쪽의 꼬리표는 오른쪽 위에,
 * 넘긴 쪽의 꼬리표는 책등 건너 왼쪽 위에 선다. 넘기는 중인 종이의 꼬리표는 그 종이와 함께 넘어가고, 뒷면에도 이름이 적혀 있다.
 * 묶음이 오른쪽 쪽에서 시작하도록 빈자리를 채운 왼쪽 쪽은 그 묶음의 표지(이름 · 수집 수)다.
 *
 * ⚠️ 접기 계산은 매 프레임이라 React 상태가 아니라 ref + DOM 속성으로 한다(apply). 어느 쪽을 어느 층에 그릴지(cfg)만 상태다 —
 *    cfg가 바뀐 렌더 직후에는 레이아웃 이펙트가 곧바로 apply해, 새 내용이 옛 접힘 모양으로 한 프레임 비치지 않게 한다.
 */

type P2 = [number, number];
const COLS = 3;
const TAB_H = 30;
const COVER_PAD = 12;
const HEAD_H = 28;
const FOOT_H = 22;
const PAD_X = 14;
const PAD_Y = 8;
const GUTTER = 12;
const GAP = 10;
/** 카드 글씨가 읽히는 폭 — 이보다 작아지면 쪽의 줄 수를 줄인다 */
const MIN_CARD_W = 104;
/** 모서리를 이만큼 가까이 가리키면 살짝 들춰 보인다 */
const PEEK_R = 70;
const AUTO_MS = 720;
/** 꼬리표 글자 — 폭이 좁아 다이아 도토리만 줄인다 */
const TAB_NAME: Record<GalleryFamily, string> = { sheep: '실용신양', rabbit: '상표토끼', mermaid: '디자인어', tiger: '특허랑이', diamond: '다이아' };

type Page =
  | { kind: 'cards'; family: GalleryFamily; cards: AcornCardDef[]; no: number; of: number }
  | { kind: 'section'; family: GalleryFamily }
  | { kind: 'cover' }
  | { kind: 'end' };

/** 넘기는 설정 — dir 1이면 오른쪽 종이를 왼쪽으로(앞으로), -1이면 왼쪽 종이를 오른쪽으로(뒤로). from → to 펼침 */
interface Cfg { dir: 1 | -1; from: number; to: number }
type Mode = 'rest' | 'peek' | 'drag' | 'auto' | 'finish' | 'return' | 'off';

interface Layout { W: number; H: number; cw: number; rows: number }

function useBookLayout(ref: React.RefObject<HTMLDivElement | null>): Layout | null {
  const [L, setL] = useState<Layout | null>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () => {
      const aw = el.clientWidth - COVER_PAD * 2;
      const ah = el.clientHeight - COVER_PAD * 2 - TAB_H;
      if (aw <= 0 || ah <= 0) return;
      const gw = aw / 2 - PAD_X * 2 - GUTTER;
      const gh = ah - HEAD_H - FOOT_H - PAD_Y * 2;
      const fit = (r: number) => Math.max(30, Math.floor(Math.min((gw - GAP * (COLS - 1)) / COLS, ((gh - GAP * (r - 1)) / r) * (5 / 7))));
      const need = Math.min(MIN_CARD_W, fit(1) - 1);
      const rows = [3, 2].find(r => fit(r) >= need) ?? 1;
      const cw = fit(rows);
      const ch = Math.round((cw * 7) / 5);
      const W = Math.floor(Math.min(aw / 2, cw * COLS + GAP * (COLS - 1) + PAD_X * 2 + GUTTER));
      const H = Math.floor(Math.min(ah, ch * rows + GAP * (rows - 1) + HEAD_H + FOOT_H + PAD_Y * 2));
      setL(l => (l && l.W === W && l.H === H && l.cw === cw && l.rows === rows ? l : { W, H, cw, rows }));
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [ref]);
  return L;
}

// ─── 접기 기하 ─────────────────────────────────────────────────────────────────────
const dot = (a: P2, b: P2) => a[0] * b[0] + a[1] * b[1];
const sub = (a: P2, b: P2): P2 => [a[0] - b[0], a[1] - b[1]];
const dist = (a: P2, b: P2) => Math.hypot(a[0] - b[0], a[1] - b[1]);
/** 볼록 다각형을 직선(M, n)으로 잘라 s쪽만 남긴다(Sutherland–Hodgman) */
function clipPoly(poly: P2[], M: P2, n: P2, s: 1 | -1): P2[] {
  const out: P2[] = [];
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i];
    const b = poly[(i + 1) % poly.length];
    const da = s * dot(sub(a, M), n);
    const db = s * dot(sub(b, M), n);
    if (da >= 0) out.push(a);
    if (da >= 0 !== db >= 0) { const t = da / (da - db); out.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]); }
  }
  return out;
}
const rect = (x0: number, y0: number, x1: number, y1: number): P2[] => [[x0, y0], [x1, y0], [x1, y1], [x0, y1]];
const reflect = (p: P2, M: P2, n: P2): P2 => { const d = 2 * dot(sub(p, M), n); return [p[0] - d * n[0], p[1] - d * n[1]]; };
const f2 = (v: number) => Math.round(v * 100) / 100;
const cssPoly = (pts: P2[], ox = 0, oy = 0) => (pts.length < 3 ? 'polygon(0 0, 0 0, 0 0)' : `polygon(${pts.map(p => `${f2(p[0] - ox)}px ${f2(p[1] - oy)}px`).join(', ')})`);
const svgPts = (pts: P2[]) => pts.map(p => `${f2(p[0])},${f2(p[1])}`).join(' ');

export function GalleryBook() {
  const col = useAcornCollection();
  const stageRef = useRef<HTMLDivElement>(null);
  const L = useBookLayout(stageRef);
  const perPage = (L?.rows ?? 2) * COLS;
  const owned = useMemo(() => col?.owned ?? {}, [col]);

  // 쪽 — 묶음마다 오른쪽 쪽(짝수 번호)에서 시작한다. 앞에 비는 왼쪽 쪽은 그 묶음의 표지
  const { pages, tabLeaf, startSpread } = useMemo(() => {
    const out: Page[] = [];
    const tabLeaf = new Map<number, GalleryFamily>();
    const startSpread = {} as Record<GalleryFamily, number>;
    for (const f of GALLERY_FAMILIES) {
      if (out.length % 2 === 1) out.push({ kind: 'section', family: f });
      const list = cardsOfFamily(f);
      const of = Math.ceil(list.length / perPage);
      tabLeaf.set(out.length / 2, f);
      startSpread[f] = out.length / 2;
      for (let i = 0; i < of; i++) out.push({ kind: 'cards', family: f, cards: list.slice(i * perPage, (i + 1) * perPage), no: i + 1, of });
    }
    return { pages: out, tabLeaf, startSpread };
  }, [perPage]);
  const spreads = Math.floor(pages.length / 2) + 1;
  const leftOf = useCallback((s: number): Page => (s === 0 ? { kind: 'cover' } : pages[2 * s - 1] ?? { kind: 'end' }), [pages]);
  const rightOf = useCallback((s: number): Page => pages[2 * s] ?? { kind: 'end' }, [pages]);
  /** 첫 쪽이 묶음의 표지 왼쪽에 오도록 — 표지(section) 쪽은 바로 다음 묶음의 것 */
  const sectionFamilyAt = (s: number): GalleryFamily | null => {
    const p = leftOf(s);
    return p.kind === 'section' ? p.family : null;
  };

  const [spread, setSpread] = useState(0);
  const defaultCfg = useCallback((s: number): Cfg | null => (s < spreads - 1 ? { dir: 1, from: s, to: s + 1 } : null), [spreads]);
  const [cfg, setCfg] = useState<Cfg | null>(() => ({ dir: 1, from: 0, to: 1 }));
  const [zoom, setZoom] = useState<string | null>(null);

  // 쪽 크기가 바뀌어 쪽 수가 달라지면 처음 펼침으로(카드 순서는 그대로라 찾기 쉽다)
  useEffect(() => {
    setSpread(0);
    setCfg(spreads > 1 ? { dir: 1, from: 0, to: 1 } : null);
  }, [perPage, spreads]);

  // ── 접힘 상태(매 프레임) ──
  const frontRef = useRef<HTMLDivElement>(null);
  const backRef = useRef<HTMLDivElement>(null);
  const fx = {
    under: useRef<SVGPolygonElement>(null), underG: useRef<SVGLinearGradientElement>(null),
    base: useRef<SVGPolygonElement>(null), baseG: useRef<SVGLinearGradientElement>(null),
    drop: useRef<SVGPolygonElement>(null),
    curl: useRef<SVGPolygonElement>(null), curlG: useRef<SVGLinearGradientElement>(null),
    low: useRef<SVGSVGElement>(null), mid: useRef<SVGSVGElement>(null), top: useRef<SVGSVGElement>(null),
  };
  const st = useRef({
    cfg: null as Cfg | null,
    G: [0, 0] as P2,
    Pc: [0, 0] as P2,
    Pt: [0, 0] as P2,
    mode: 'rest' as Mode,
    t0: 0,
    final: [0, 0] as P2,
    down: null as null | { q: P2; G: P2 | null; direct: boolean; pointerId: number },
    suppressClick: false,
  });
  const cfgRef = useRef<Cfg | null>(cfg);
  const LRef = useRef<Layout | null>(L);
  const commitRef = useRef<(c: Cfg) => void>(() => {});

  /** 넘기는 쪽의 바깥 모서리 — 아래(기본) · 위 */
  const corner = (c: Cfg, Lx: Layout, top = false): P2 => [c.dir === 1 ? 2 * Lx.W : 0, top ? TAB_H : TAB_H + Lx.H];
  const inwardOf = (G: P2, Lx: Layout): P2 => {
    const c: P2 = [G[0] < Lx.W ? Lx.W / 2 : Lx.W * 1.5, TAB_H + Lx.H / 2];
    const v = sub(c, G);
    const l = Math.hypot(v[0], v[1]);
    return [v[0] / l, v[1] / l];
  };
  const restOf = (G: P2, Lx: Layout, amount: number): P2 => { const u = inwardOf(G, Lx); return [G[0] + u[0] * amount, G[1] + u[1] * amount]; };
  /** 종이는 책등에 묶여 있다 — 잡은 모서리와 같은 높이의 책등 끝에서 쪽 폭 안, 반대쪽 책등 끝에서 대각선 안 */
  const constrainP = (P: P2, G: P2, Lx: Layout): P2 => {
    const yTop = TAB_H;
    const yBot = TAB_H + Lx.H;
    const nearS: P2 = [Lx.W, G[1] === yTop ? yTop : yBot];
    const farS: P2 = [Lx.W, G[1] === yTop ? yBot : yTop];
    let q = P;
    const d1 = dist(q, nearS);
    if (d1 > Lx.W) q = [nearS[0] + ((q[0] - nearS[0]) * Lx.W) / d1, nearS[1] + ((q[1] - nearS[1]) * Lx.W) / d1];
    const diag = Math.hypot(Lx.W, Lx.H);
    const d2 = dist(q, farS);
    if (d2 > diag) q = [farS[0] + ((q[0] - farS[0]) * diag) / d2, farS[1] + ((q[1] - farS[1]) * diag) / d2];
    return q;
  };

  /** 지금 접힘을 DOM에 그린다 */
  const apply = useCallback(() => {
    const s = st.current;
    const Lx = LRef.current;
    const c = cfgRef.current;
    const front = frontRef.current;
    const back = backRef.current;
    const hide = () => {
      if (back) back.style.visibility = 'hidden';
      [fx.low, fx.mid, fx.top].forEach(r => r.current?.setAttribute('visibility', 'hidden'));
      if (front) front.style.clipPath = '';
    };
    if (!Lx || !c || !front || !back || s.cfg !== c) { hide(); return; }
    const { W, H } = Lx;
    const G = s.G;
    const P = s.Pc;
    const len = dist(G, P);
    if (len < 0.5) { hide(); return; }
    const n: P2 = [(P[0] - G[0]) / len, (P[1] - G[1]) / len];
    const M: P2 = [(G[0] + P[0]) / 2, (G[1] + P[1]) / 2];
    const leaf = c.dir === 1 ? rect(W, 0, 2 * W, TAB_H + H) : rect(0, 0, W, TAB_H + H);
    const base = clipPoly(leaf, M, n, 1);
    const flap = clipPoly(leaf, M, n, -1);
    // 남는 앞면
    front.style.clipPath = cssPoly(base, c.dir === 1 ? W : 0, 0);
    // 넘어간 뒷면 — 바른 방향으로 그린 다음 쪽 내용(자리 N) → 책등 반사 → 접는 선 반사
    const nx = c.dir === 1 ? 0 : W; // 뒷면 내용이 다 넘긴 뒤 놓일 자리(왼쪽 0 · 오른쪽 W)
    const a = 1 - 2 * n[0] * n[0];
    const b = -2 * n[0] * n[1];
    const d = 1 - 2 * n[1] * n[1];
    const k = dot(M, n);
    const e = 2 * k * n[0];
    const fy = 2 * k * n[1];
    // R_fold ∘ R_spine ∘ translate(nx): x' = R_fold(2W − (x + nx), y)
    const tx = a * (2 * W - nx) + e;
    const ty = b * (2 * W - nx) + fy;
    back.style.visibility = 'visible';
    back.style.transform = `matrix(${-a}, ${-b}, ${b}, ${d}, ${tx}, ${ty})`;
    // 뒷면 자신의 좌표로 본 보이는 범위 = 넘어가는 쪽을 책등에 반사한 것
    back.style.clipPath = cssPoly(flap.map(p => [2 * W - p[0], p[1]] as P2), nx, 0);
    // 그늘 · 그림자 · 말림 — 종이 부분(꼬리표 줄 아래)에만
    const paper = (poly: P2[]) => clipPoly(poly, [0, TAB_H], [0, 1], 1);
    const flapPaper = paper(flap);
    const flapShown = flapPaper.map(p => reflect(p, M, n));
    fx.under.current?.setAttribute('points', svgPts(flapPaper));
    fx.base.current?.setAttribute('points', svgPts(paper(base)));
    fx.drop.current?.setAttribute('points', svgPts(flapShown));
    fx.curl.current?.setAttribute('points', svgPts(flapShown));
    const setG = (g: SVGLinearGradientElement | null, from: P2, to: P2) => {
      if (!g) return;
      g.setAttribute('x1', `${f2(from[0])}`); g.setAttribute('y1', `${f2(from[1])}`);
      g.setAttribute('x2', `${f2(to[0])}`); g.setAttribute('y2', `${f2(to[1])}`);
    };
    setG(fx.underG.current, M, [M[0] - n[0] * W * 0.22, M[1] - n[1] * W * 0.22]);
    setG(fx.baseG.current, M, [M[0] + n[0] * 26, M[1] + n[1] * 26]);
    setG(fx.curlG.current, M, P);
    [fx.low, fx.mid, fx.top].forEach(r => r.current?.setAttribute('visibility', 'visible'));
  // fx는 ref 묶음이라 바뀌지 않는다
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /** 쉬는 자세 — 넘길 수 있으면 오른쪽 아래 모서리가 살짝 들려 있다(팩의 들린 모서리와 같은 신호) */
  const toRest = useCallback((c: Cfg | null, Lx: Layout | null) => {
    const s = st.current;
    s.cfg = c;
    s.mode = 'rest';
    if (!c || !Lx) return;
    s.G = corner(c, Lx);
    s.Pc = [s.G[0], s.G[1]];
    s.Pt = c.dir === 1 ? restOf(s.G, Lx, 14) : [s.G[0], s.G[1]];
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // cfg · 크기가 바뀐 렌더 직후, 페인트 전에 접힘을 맞춘다
  useLayoutEffect(() => {
    cfgRef.current = cfg;
    LRef.current = L;
    const s = st.current;
    if (s.cfg !== cfg) toRest(cfg, L);
    else if (L && cfg && s.mode === 'rest') toRest(cfg, L);
    apply();
  }, [cfg, L, apply, toRest]);

  const commit = useCallback((c: Cfg) => {
    const next = defaultCfg(c.to);
    setSpread(c.to);
    setCfg(next);
  }, [defaultCfg]);
  useEffect(() => { commitRef.current = commit; }, [commit]);

  // ── 매 프레임 ──
  useEffect(() => {
    let raf = 0;
    const tick = () => {
      const s = st.current;
      const Lx = LRef.current;
      const c = cfgRef.current;
      if (Lx && c && s.cfg === c) {
        if (s.mode === 'auto') {
          const k = Math.min(1, (performance.now() - s.t0) / AUTO_MS);
          const e = k < 0.5 ? 2 * k * k : 1 - (-2 * k + 2) ** 2 / 2;
          const lift = Math.sin(Math.PI * e) * Lx.H * 0.16;
          s.Pt = [s.G[0] + (s.final[0] - s.G[0]) * e, s.G[1] + (s.final[1] - s.G[1]) * e - lift];
          s.Pc = s.Pt;
          if (k >= 1) { s.mode = 'off'; commitRef.current(c); }
        } else if (s.mode !== 'off') {
          const kk = s.mode === 'drag' ? 0.5 : s.mode === 'finish' || s.mode === 'return' ? 0.2 : 0.18;
          s.Pc = [s.Pc[0] + (s.Pt[0] - s.Pc[0]) * kk, s.Pc[1] + (s.Pt[1] - s.Pc[1]) * kk];
          if (s.mode === 'finish' && dist(s.Pc, s.final) < 1.2) { s.mode = 'off'; commitRef.current(c); }
          if (s.mode === 'return' && dist(s.Pc, s.Pt) < 0.8) {
            // 앞으로 넘기던 아래 모서리면 그대로 쉬는 자세 — 그 밖(뒤로 · 위 모서리)은 펴진 뒤 기본 설정으로 되돌린다
            if (c.dir === 1 && s.G[1] !== TAB_H) s.mode = 'rest';
            else { s.mode = 'off'; setCfg(defaultCfgRef.current(spreadRef.current)); }
          }
        }
      }
      apply();
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [apply]);
  const spreadRef = useRef(spread);
  const defaultCfgRef = useRef(defaultCfg);
  useEffect(() => { spreadRef.current = spread; defaultCfgRef.current = defaultCfg; }, [spread, defaultCfg]);

  /** 버튼 없이 넘긴다(꼬리표 · 방향키) — 아래 모서리를 잡아 반대편까지 들어 올리며 넘긴다 */
  const jump = useCallback((to: number) => {
    const Lx = LRef.current;
    const s = st.current;
    if (!Lx || to === spreadRef.current || to < 0 || to >= spreads) return;
    if (s.mode === 'auto' || s.mode === 'finish' || s.mode === 'off') return;
    const c: Cfg = { dir: to > spreadRef.current ? 1 : -1, from: spreadRef.current, to };
    s.cfg = c;
    s.mode = 'auto';
    s.G = corner(c, Lx);
    s.Pc = [s.G[0], s.G[1]];
    s.final = [2 * Lx.W - s.G[0], s.G[1]];
    s.t0 = performance.now();
    setCfg(c);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [spreads]);

  // ── 끌어서 넘기기 · 모서리 들춰 보기 ──
  const bookRef = useRef<HTMLDivElement>(null);
  const local = (e: React.PointerEvent): P2 => {
    const r = bookRef.current!.getBoundingClientRect();
    return [e.clientX - r.left, e.clientY - r.top];
  };
  const outerCorners = (Lx: Layout): { G: P2; dir: 1 | -1; top: boolean }[] => {
    const out: { G: P2; dir: 1 | -1; top: boolean }[] = [];
    if (spread < spreads - 1) out.push({ G: [2 * Lx.W, TAB_H + Lx.H], dir: 1, top: false }, { G: [2 * Lx.W, TAB_H], dir: 1, top: true });
    if (spread > 0) out.push({ G: [0, TAB_H + Lx.H], dir: -1, top: false }, { G: [0, TAB_H], dir: -1, top: true });
    return out;
  };
  /** 넘기는 설정을 바꾼다 — 같은 방향이면 그대로 */
  const ensureCfg = (dir: 1 | -1): Cfg | null => {
    const cur = st.current.cfg;
    if (cur && cur.dir === dir && cur.from === spread) return cur;
    const to = spread + dir;
    if (to < 0 || to >= spreads) return null;
    const c: Cfg = { dir, from: spread, to };
    st.current.cfg = c;
    setCfg(c);
    return c;
  };
  const onPointerDown = (e: React.PointerEvent) => {
    const Lx = L;
    const s = st.current;
    if (!Lx || s.mode === 'auto' || s.mode === 'finish' || s.mode === 'off') return;
    if (e.button !== 0 && e.pointerType === 'mouse') return;
    const q = local(e);
    const near = outerCorners(Lx).find(o => dist(o.G, q) < PEEK_R);
    s.down = { q, G: near ? near.G : null, direct: !!near, pointerId: e.pointerId };
    s.suppressClick = false;
  };
  const onPointerMove = (e: React.PointerEvent) => {
    const Lx = L;
    const s = st.current;
    if (!Lx) return;
    const q = local(e);
    if (s.mode === 'drag' && s.down) {
      const raw: P2 = s.down.direct ? q : [s.G[0] + q[0] - s.down.q[0], s.G[1] + q[1] - s.down.q[1]];
      s.Pt = constrainP(raw, s.G, Lx);
      return;
    }
    if (s.down) {
      const dx = q[0] - s.down.q[0];
      const dy = q[1] - s.down.q[1];
      if (Math.hypot(dx, dy) < 8) return;
      // 오른쪽 쪽을 왼쪽으로 끌면 앞으로, 왼쪽 쪽을 오른쪽으로 끌면 뒤로
      const onRight = s.down.q[0] > Lx.W;
      const dir: 1 | -1 | 0 = onRight && dx < 0 ? 1 : !onRight && dx > 0 ? -1 : 0;
      if (!dir) { s.down = null; return; }
      const c = ensureCfg(dir);
      if (!c) { s.down = null; return; }
      const top = s.down.direct ? s.down.G![1] === TAB_H : s.down.q[1] < TAB_H + Lx.H / 2;
      const G = corner(c, Lx, top);
      if (s.G[0] !== G[0] || s.G[1] !== G[1] || s.mode !== 'peek') s.Pc = [G[0], G[1]];
      s.G = G;
      s.mode = 'drag';
      s.suppressClick = true;
      try { (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId); } catch { /* 이미 놓았다 */ }
      const raw: P2 = s.down.direct ? q : [G[0] + dx, G[1] + dy];
      s.Pt = constrainP(raw, G, Lx);
      return;
    }
    // 가리키기만 할 때 — 바깥 모서리 가까이면 살짝 들춘다
    if (e.pointerType !== 'mouse' || s.mode === 'auto' || s.mode === 'finish' || s.mode === 'off') return;
    const near = outerCorners(Lx).find(o => dist(o.G, q) < PEEK_R);
    if (near) {
      const c = ensureCfg(near.dir);
      if (!c) return;
      const G = corner(c, Lx, near.top);
      if (s.G[0] !== G[0] || s.G[1] !== G[1]) s.Pc = [G[0], G[1]];
      s.G = G;
      s.mode = 'peek';
      s.Pt = constrainP(restOf(G, Lx, 44), G, Lx);
    } else if (s.mode === 'peek') {
      s.mode = 'return';
      s.Pt = st.current.cfg?.dir === 1 && !(s.G[1] === TAB_H) ? restOf(corner(st.current.cfg, Lx), Lx, 14) : [s.G[0], s.G[1]];
    }
  };
  const release = () => {
    const Lx = L;
    const s = st.current;
    s.down = null;
    if (s.mode !== 'drag' || !Lx) return;
    const c = s.cfg!;
    // 책등을 넘겼으면 끝까지, 아니면 제자리로
    const past = c.dir === 1 ? s.Pc[0] < Lx.W : s.Pc[0] > Lx.W;
    if (past) { s.mode = 'finish'; s.final = [2 * Lx.W - s.G[0], s.G[1]]; s.Pt = s.final; }
    else { s.mode = 'return'; s.Pt = c.dir === 1 && s.G[1] !== TAB_H ? restOf(s.G, Lx, 14) : [s.G[0], s.G[1]]; }
  };
  const onLeave = () => {
    const s = st.current;
    if (s.mode === 'peek' && L) { s.mode = 'return'; s.Pt = s.cfg?.dir === 1 && s.G[1] !== TAB_H ? restOf(s.G, L, 14) : [s.G[0], s.G[1]]; }
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (zoom) { if (e.key === 'Escape') setZoom(null); return; }
      if (e.key === 'ArrowRight' || e.key === 'PageDown') jump(spread + 1);
      else if (e.key === 'ArrowLeft' || e.key === 'PageUp') jump(spread - 1);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [jump, spread, zoom]);

  const total = ACORN_CARDS.length;
  const have = ACORN_CARDS.filter(c => owned[c.id]).length;

  // 어느 쪽을 어느 층에 — 앞으로: 밑 왼쪽 = 지금 왼쪽, 밑 오른쪽 = 다음 오른쪽, 넘어가는 앞면 = 지금 오른쪽, 뒷면 = 다음 왼쪽
  const c = cfg && cfg.from === spread ? cfg : null;
  const underL = c && c.dir === -1 ? leftOf(c.to) : leftOf(spread);
  const underR = c && c.dir === 1 ? rightOf(c.to) : rightOf(spread);
  const frontPage = c ? (c.dir === 1 ? rightOf(spread) : leftOf(spread)) : null;
  const backPage = c ? (c.dir === 1 ? leftOf(c.to) : rightOf(c.to)) : null;
  /** 넘어가는 종이(잎) 번호 — 앞으로면 지금 오른쪽 종이, 뒤로면 지금 왼쪽 종이 */
  const movingLeaf = c ? (c.dir === 1 ? spread : spread - 1) : -1;

  const W = L?.W ?? 0;
  const H = L?.H ?? 0;
  const famCount = (f: GalleryFamily) => { const list = cardsOfFamily(f); return { n: list.filter(x => owned[x.id]).length, total: list.length }; };
  const tabProps = (f: GalleryFamily) => ({ family: f, index: GALLERY_FAMILIES.indexOf(f), count: famCount(f), W, ready: !!col, onJump: () => jump(startSpread[f]) });

  return (
    <section className="book">
      <div className="book-stage" ref={stageRef}>
        {L && (
          <div
            className="book-spread"
            ref={bookRef}
            style={{ width: 2 * W, height: TAB_H + H, ['--page-w' as string]: `${W}px`, ['--tab-h' as string]: `${TAB_H}px` } as React.CSSProperties}
            data-small={L.cw < 80 ? '' : undefined}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={release}
            onPointerCancel={release}
            onPointerLeave={onLeave}
            onClickCapture={e => { if (st.current.suppressClick) { e.stopPropagation(); e.preventDefault(); st.current.suppressClick = false; } }}
          >
            <div className="book-leather" aria-hidden="true" />
            {/* 밑에 깔린 두 쪽 */}
            <div className="book-leaf" data-layer="under" style={{ transform: 'translate(0px, 0px)' }}>
              <PageFace page={underL} side="left" L={L} owned={owned} onZoom={setZoom} have={have} total={total} ready={!!col} famCount={famCount} />
            </div>
            <div className="book-leaf" data-layer="under" style={{ transform: `translate(${W}px, 0px)` }}>
              <PageFace page={underR} side="right" L={L} owned={owned} onZoom={setZoom} have={have} total={total} ready={!!col} famCount={famCount} />
            </div>
            {/* 움직이지 않는 꼬리표 — 넘기지 않은 종이는 오른쪽, 넘긴 종이는 왼쪽 */}
            {[...tabLeaf.entries()].filter(([j]) => j !== movingLeaf).map(([j, f]) => (
              <div key={f} className="book-tabrow" style={{ transform: `translate(${j < spread ? 0 : W}px, 0px)` }}>
                <Tab {...tabProps(f)} side={j < spread ? 'left' : 'right'} />
              </div>
            ))}
            <div className="book-spine" aria-hidden="true" style={{ top: TAB_H, height: H }} />
            {/* 넘어가는 쪽에 드리운 그늘 */}
            <svg className="book-fx" ref={fx.low} width={2 * W} height={TAB_H + H} visibility="hidden" aria-hidden="true">
              <defs>
                <linearGradient ref={fx.underG} id="bookUnderG" gradientUnits="userSpaceOnUse">
                  <stop offset="0" stopColor="#3a2410" stopOpacity=".42" />
                  <stop offset="1" stopColor="#3a2410" stopOpacity="0" />
                </linearGradient>
              </defs>
              <polygon ref={fx.under} fill="url(#bookUnderG)" />
            </svg>
            {/* 넘어가는 종이의 앞면(남은 부분) */}
            {c && frontPage && (
              <div className="book-leaf" data-layer="front" ref={frontRef} style={{ transform: `translate(${c.dir === 1 ? W : 0}px, 0px)` }}>
                <PageFace page={frontPage} side={c.dir === 1 ? 'right' : 'left'} L={L} owned={owned} onZoom={setZoom} have={have} total={total} ready={!!col} famCount={famCount} />
                {tabLeaf.has(movingLeaf) && <Tab {...tabProps(tabLeaf.get(movingLeaf)!)} side={c.dir === 1 ? 'right' : 'left'} />}
              </div>
            )}
            {/* 접힌 선 옆 그늘 · 넘어간 종이의 그림자 */}
            <svg className="book-fx" ref={fx.mid} width={2 * W} height={TAB_H + H} visibility="hidden" aria-hidden="true">
              <defs>
                <linearGradient ref={fx.baseG} id="bookBaseG" gradientUnits="userSpaceOnUse">
                  <stop offset="0" stopColor="#3a2410" stopOpacity=".3" />
                  <stop offset="1" stopColor="#3a2410" stopOpacity="0" />
                </linearGradient>
                <filter id="bookDropBlur" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="7" /></filter>
              </defs>
              <polygon ref={fx.base} fill="url(#bookBaseG)" />
              <polygon ref={fx.drop} fill="#1a0f05" opacity=".35" filter="url(#bookDropBlur)" transform="translate(4 6)" />
            </svg>
            {/* 넘어간 종이의 뒷면 — 다음 쪽 내용을 바른 방향으로 그려 두고 apply가 transform · clip-path를 건다 */}
            {c && backPage && (
              <div className="book-leaf" data-layer="back" ref={backRef} style={{ visibility: 'hidden', transformOrigin: '0 0' }}>
                <PageFace page={backPage} side={c.dir === 1 ? 'left' : 'right'} L={L} owned={owned} onZoom={setZoom} have={have} total={total} ready={!!col} famCount={famCount} />
                {tabLeaf.has(movingLeaf) && <Tab {...tabProps(tabLeaf.get(movingLeaf)!)} side={c.dir === 1 ? 'left' : 'right'} back />}
              </div>
            )}
            {/* 말림 — 접힌 선의 주름 그늘 → 조금 떨어져 하이라이트 → 끝으로 갈수록 살짝 어둡게(원본 데모의 curlG) */}
            <svg className="book-fx" ref={fx.top} width={2 * W} height={TAB_H + H} visibility="hidden" aria-hidden="true">
              <defs>
                <linearGradient ref={fx.curlG} id="bookCurlG" gradientUnits="userSpaceOnUse">
                  <stop offset="0" stopColor="#3a2410" stopOpacity=".38" />
                  <stop offset=".05" stopColor="#3a2410" stopOpacity=".1" />
                  <stop offset=".12" stopColor="#fff" stopOpacity=".45" />
                  <stop offset=".24" stopColor="#fff" stopOpacity=".08" />
                  <stop offset=".4" stopColor="#fff" stopOpacity="0" />
                  <stop offset=".8" stopColor="#3a2410" stopOpacity="0" />
                  <stop offset="1" stopColor="#3a2410" stopOpacity=".16" />
                </linearGradient>
              </defs>
              <polygon ref={fx.curl} fill="url(#bookCurlG)" />
            </svg>
          </div>
        )}
      </div>
      <p className="book-hint">
        {sectionFamilyAt(spread) ? `${ACORN_FAMILY_NAME[sectionFamilyAt(spread)!]} · ` : ''}
        모서리를 잡고 끌어 넘겨요 · 꼬리표를 누르면 그 장으로 · {spread + 1} / {spreads}
      </p>
      {zoom && <CardZoom id={zoom} count={owned[zoom] ?? 0} onClose={() => setZoom(null)} />}
    </section>
  );
}

/** 꼬리표 — 그 묶음 첫 쪽의 종이 위로 튀어나온다. 왼쪽(넘긴 쪽)에서는 책등 기준으로 거울 자리에 선다 */
function Tab({ family, index, count, W, side, back, ready, onJump }: {
  family: GalleryFamily; index: number; count: { n: number; total: number }; W: number; side: 'left' | 'right'; back?: boolean; ready: boolean; onJump: () => void;
}) {
  const tw = Math.min(118, (W * 0.93 - 4 * 3) / 5);
  const fromSpine = W * 0.035 + index * (tw + 3);
  const x = side === 'right' ? fromSpine : W - fromSpine - tw;
  return (
    <button
      type="button"
      className="book-tab"
      data-family={family}
      data-back={back ? '' : undefined}
      tabIndex={back ? -1 : 0}
      style={{ left: x, width: tw }}
      onClick={onJump}
      aria-label={`${ACORN_FAMILY_NAME[family]} 장으로`}
    >
      <span className="book-tab-name">{TAB_NAME[family]}</span>
      <small>{ready ? count.n : '—'}/{count.total}</small>
    </button>
  );
}

function PageFace({ page, side, L, owned, onZoom, have, total, ready, famCount }: {
  page: Page; side: 'left' | 'right'; L: Layout; owned: Record<string, number>; onZoom: (id: string) => void;
  have: number; total: number; ready: boolean; famCount: (f: GalleryFamily) => { n: number; total: number };
}) {
  const ch = Math.round((L.cw * 7) / 5);
  return (
    <div className="book-page" data-side={side} data-kind={page.kind} data-family={'family' in page ? page.family : undefined} style={{ top: TAB_H, width: L.W, height: L.H }}>
      {page.kind === 'cards' && (
        <>
          <div className="book-page-head">
            <b>{ACORN_FAMILY_NAME[page.family]}</b>
            <span>{page.no} / {page.of}</span>
          </div>
          <div className="book-grid" style={{ gridTemplateColumns: `repeat(${COLS}, ${L.cw}px)`, gridAutoRows: `${ch}px`, gap: GAP }}>
            {page.cards.map(def => {
              const n = owned[def.id] ?? 0;
              return (
                <button
                  key={def.id}
                  type="button"
                  className="book-slot"
                  data-owned={n > 0 ? '' : undefined}
                  data-rarity={rarityOf(def)}
                  onClick={() => onZoom(def.id)}
                  aria-label={`${def.name} — ${RARITY_NAME[rarityOf(def)]}${n > 0 ? `, ${n}장 보유` : ', 미획득'}`}
                >
                  <AcornCard id={def.id} tier={displayTierOf(def)} />
                  {n > 0 ? (n > 1 && <span className="book-count">×{n}</span>) : <span className="book-lock">미획득</span>}
                </button>
              );
            })}
          </div>
          <div className="book-page-foot">{side === 'left' ? '◂' : ''} {ACORN_FAMILY_NAME[page.family]} {side === 'right' ? '▸' : ''}</div>
        </>
      )}
      {page.kind === 'section' && (() => {
        const cnt = famCount(page.family);
        return (
          <div className="book-section">
            <img src={page.family === 'diamond' ? PLAY_ASSETS.iconAcorn : `/howto/face_${page.family}.webp`} alt="" draggable={false} />
            <h2>{ACORN_FAMILY_NAME[page.family]}</h2>
            <p>{ready ? cnt.n : '—'} / {cnt.total}종 수집</p>
            <span className="book-progress-bar"><i style={{ width: `${(cnt.n / cnt.total) * 100}%` }} /></span>
          </div>
        );
      })()}
      {page.kind === 'cover' && (
        <div className="book-section book-cover-page">
          <img src={PLAY_ASSETS.iconAcorn} alt="" draggable={false} />
          <h2>도토리 증강 카드<br />갤러리 북</h2>
          <p>{ready ? have : '—'} / {total}종 수집</p>
          <span className="book-progress-bar"><i style={{ width: `${(have / total) * 100}%` }} /></span>
          <small>오른쪽 아래 모서리를 잡고 왼쪽으로 끌어 넘겨요</small>
        </div>
      )}
      {page.kind === 'end' && (
        <div className="book-section book-end-page">
          <img src={PLAY_ASSETS.iconAcorn} alt="" draggable={false} />
          <p>— 끝 —</p>
        </div>
      )}
    </div>
  );
}

function CardZoom({ id, count, onClose }: { id: string; count: number; onClose: () => void }) {
  const def = ACORN_CARDS.find(c => c.id === id);
  if (!def || typeof document === 'undefined') return null;
  return createPortal(
    <div className="book-zoom" role="dialog" aria-modal="true" aria-label={def.name} onClick={onClose}>
      <div className="book-zoom-card" data-owned={count > 0 ? '' : undefined} data-rarity={rarityOf(def)} onClick={e => e.stopPropagation()}>
        <AcornCard id={def.id} tier={displayTierOf(def)} />
      </div>
      <p className="book-zoom-info">
        <b data-rarity={rarityOf(def)}>{RARITY_NAME[rarityOf(def)]}</b>
        {count > 0 ? ` · ${count}장 보유` : ' · 아직 얻지 못한 카드'}
      </p>
      <button type="button" className="book-zoom-close" onClick={onClose} aria-label="닫기">✕</button>
    </div>,
    document.body,
  );
}
