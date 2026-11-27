'use client';

import { useSyncExternalStore } from 'react';
import type { AcornCardDef, AcornTier } from 'shared';
import { ACORN_CARDS, ACORN_DIAMOND_SLOT_CHANCE, ACORN_TIER_NAME, ACORN_TIER_ODDS, ACORN_TIERS, acornCard } from 'shared';

/**
 * 도토리 증강 카드 수집(갤러리 북 · 상점 · 팩 열기 — app/cards/).
 *
 * 이 게임에는 계정이 없어서 수집 기록은 **이 브라우저의 localStorage**에만 남는다(다른 기기 · 시크릿 창에서는 처음부터).
 * 판 안에서 고르는 도토리 카드(엔진의 AcornState)와는 따로 간다 — 여기서 모은 카드가 판에 영향을 주지는 않는다.
 *
 * 화폐는 **도토리 반도체**. 진짜 돈과 바꾸는 길은 없고, 처음 시작할 때와 하루 한 번 무료로 충전된다.
 */

/** 팩 한 개에 든 카드 수 */
export const PACK_SIZE = 5;
/** 처음 들어왔을 때 주는 것 — 반도체와 바로 열어 볼 팩 하나 */
export const START_CHIPS = 1000;
export const START_PACKS = 1;
/** 하루 한 번 무료 충전(기기 시계의 날짜 기준) */
export const DAILY_CHIPS = 300;

export interface PackProduct {
  id: string;
  name: string;
  packs: number;
  /** 덤으로 더 주는 팩 */
  bonus: number;
  price: number;
}
export const PACK_PRODUCTS: readonly PackProduct[] = [
  { id: 'p1', name: '도토리 증강팩', packs: 1, bonus: 0, price: 100 },
  { id: 'p5', name: '도토리 증강팩 묶음', packs: 5, bonus: 0, price: 480 },
  { id: 'p10', name: '도토리 증강팩 상자', packs: 10, bonus: 1, price: 950 },
];

/** 화면의 레어도 — 동물 카드의 네 단계 + 다이아(황금과 무지개빛 사이) */
export type PackRarity = 'bronze' | 'silver' | 'gold' | 'diamond' | 'rainbow';
export const RARITY_RANK: Record<PackRarity, number> = { bronze: 1, silver: 2, gold: 3, diamond: 4, rainbow: 5 };
export const RARITY_NAME: Record<PackRarity, string> = {
  bronze: ACORN_TIER_NAME[1], silver: ACORN_TIER_NAME[2], gold: ACORN_TIER_NAME[3], diamond: '다이아 도토리', rainbow: ACORN_TIER_NAME[4],
};
const TIER_RARITY: Record<AcornTier, PackRarity> = { 1: 'bronze', 2: 'silver', 3: 'gold', 4: 'rainbow' };

export function rarityOf(def: AcornCardDef): PackRarity {
  return def.family === 'diamond' ? 'diamond' : TIER_RARITY[def.tier as AcornTier];
}
/** AcornCard에 넘길 단계 — 다이아는 단계 이름을 쓰지 않으므로 아무 값이나 된다 */
export function displayTierOf(def: AcornCardDef): AcornTier {
  return def.family === 'diamond' ? 3 : (def.tier as AcornTier);
}

// ─── 확률(상점의 [확률 정보]가 이 숫자를 그대로 보여 준다) ─────────────────────────
const DIAMOND_PCT = ACORN_DIAMOND_SLOT_CHANCE * 100;
export interface RarityOdds { rarity: PackRarity; pct: number; count: number }
/** 카드 한 장의 레어도별 확률(%) — 다이아 10%, 나머지 90%를 판 안의 단계 확률(50 · 30 · 15 · 5)로 나눈다 */
export function packOdds(): RarityOdds[] {
  const rest = 100 - DIAMOND_PCT;
  const rows: RarityOdds[] = ACORN_TIERS.map(t => ({
    rarity: TIER_RARITY[t],
    pct: (rest * ACORN_TIER_ODDS[t]) / 100,
    count: ACORN_CARDS.filter(c => c.family !== 'diamond' && c.tier === t).length,
  }));
  rows.push({ rarity: 'diamond', pct: DIAMOND_PCT, count: ACORN_CARDS.filter(c => c.family === 'diamond').length });
  return rows.sort((a, b) => RARITY_RANK[a.rarity] - RARITY_RANK[b.rarity]);
}

/** 팩 한 개 굴리기 — 장마다 따로(중복 가능). 같은 레어도 안에서는 모든 카드가 같은 확률이다 */
export function rollPack(rng: () => number = Math.random): string[] {
  const out: string[] = [];
  for (let i = 0; i < PACK_SIZE; i++) {
    let pool: AcornCardDef[];
    if (rng() * 100 < DIAMOND_PCT) {
      pool = ACORN_CARDS.filter(c => c.family === 'diamond');
    } else {
      let r = rng() * 100;
      let tier: AcornTier = 1;
      for (const t of ACORN_TIERS) {
        r -= ACORN_TIER_ODDS[t];
        if (r < 0) { tier = t; break; }
      }
      pool = ACORN_CARDS.filter(c => c.family !== 'diamond' && c.tier === tier);
    }
    out.push(pool[Math.floor(rng() * pool.length)].id);
  }
  return out;
}

// ─── 저장 ───────────────────────────────────────────────────────────────────
export interface AcornCollection {
  v: 1;
  chips: number;
  packs: number;
  /** 카드 id → 가진 장수 */
  owned: Record<string, number>;
  /** 마지막으로 무료 충전을 받은 날(YYYY-MM-DD, 기기 시계) */
  lastDaily: string | null;
  /** 지금까지 연 팩 수 */
  opened: number;
}

const KEY = 'cardBattle_acornCollection';

function fresh(): AcornCollection {
  return { v: 1, chips: START_CHIPS, packs: START_PACKS, owned: {}, lastDaily: null, opened: 0 };
}

function load(): AcornCollection {
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return fresh();
    const p = JSON.parse(raw) as Partial<AcornCollection>;
    const owned: Record<string, number> = {};
    for (const [id, n] of Object.entries(p.owned ?? {})) if (acornCard(id) && typeof n === 'number' && n > 0) owned[id] = Math.floor(n);
    return {
      v: 1,
      chips: Math.max(0, Math.floor(Number(p.chips) || 0)),
      packs: Math.max(0, Math.floor(Number(p.packs) || 0)),
      owned,
      lastDaily: typeof p.lastDaily === 'string' ? p.lastDaily : null,
      opened: Math.max(0, Math.floor(Number(p.opened) || 0)),
    };
  } catch {
    return fresh();
  }
}

let cache: AcornCollection | null = null;
const listeners = new Set<() => void>();

function current(): AcornCollection {
  if (!cache) cache = load();
  return cache;
}
function commit(next: AcornCollection) {
  cache = next;
  try { window.localStorage.setItem(KEY, JSON.stringify(next)); } catch { /* 저장이 막힌 창 — 이 탭 안에서만 유지된다 */ }
  listeners.forEach(l => l());
}
function subscribe(l: () => void) {
  listeners.add(l);
  // 다른 탭에서 바꾼 것도 따라간다
  const onStorage = (e: StorageEvent) => { if (e.key === KEY) { cache = load(); l(); } };
  window.addEventListener('storage', onStorage);
  return () => { listeners.delete(l); window.removeEventListener('storage', onStorage); };
}

/** 서버 렌더 · 첫 하이드레이션에는 null — localStorage는 마운트된 뒤에만 읽는다 */
export function useAcornCollection(): AcornCollection | null {
  return useSyncExternalStore(subscribe, current, () => null);
}

export function todayKey(d = new Date()): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
export function canClaimDaily(c: AcornCollection): boolean {
  return c.lastDaily !== todayKey();
}
export function claimDaily(): boolean {
  const c = current();
  if (!canClaimDaily(c)) return false;
  commit({ ...c, chips: c.chips + DAILY_CHIPS, lastDaily: todayKey() });
  return true;
}

export function buyProduct(id: string): boolean {
  const c = current();
  const p = PACK_PRODUCTS.find(x => x.id === id);
  if (!p || c.chips < p.price) return false;
  commit({ ...c, chips: c.chips - p.price, packs: c.packs + p.packs + p.bonus });
  return true;
}

export interface OpenedCard { id: string; isNew: boolean }
/** 팩 하나를 열어 카드를 넣는다 — 팩이 없으면 null. 같은 팩 안에서 두 번 나온 카드는 앞의 것만 NEW */
export function openPack(rng: () => number = Math.random): OpenedCard[] | null {
  const c = current();
  if (c.packs <= 0) return null;
  const ids = rollPack(rng);
  const owned = { ...c.owned };
  const cards = ids.map(id => {
    const isNew = !owned[id];
    owned[id] = (owned[id] ?? 0) + 1;
    return { id, isNew };
  });
  commit({ ...c, packs: c.packs - 1, owned, opened: c.opened + 1 });
  return cards;
}

/** 갤러리 북의 쪽 순서 — 동물 넷 + 다이아, 쪽 안에서는 단계 순 */
export const GALLERY_FAMILIES = ['sheep', 'rabbit', 'mermaid', 'tiger', 'diamond'] as const;
export type GalleryFamily = (typeof GALLERY_FAMILIES)[number];
export function cardsOfFamily(f: GalleryFamily): AcornCardDef[] {
  return ACORN_CARDS.filter(c => c.family === f).slice().sort((a, b) => a.tier - b.tier || a.id.localeCompare(b.id));
}
