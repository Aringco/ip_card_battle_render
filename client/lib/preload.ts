'use client';

import { IMAGE_FILES, PRELOAD_FILES } from './assetManifest';

// 게임에 필요한 효과음·이미지를 시작 전에 한 번에 받아두는 프리로더.
//
// 그냥 <img>/Audio에 맡기면 "카드가 뒤집히는 순간에야 이미지를 받기 시작"하거나
// "첫 효과음이 한 박자 늦게 울리는" 문제가 생긴다. 여기서 fetch로 받아
// blob URL로 들고 있으면, 이후 재생/표시는 네트워크를 전혀 타지 않는다.
//
// 모듈 스코프 싱글턴이라 여러 페이지에서 startPreload()를 불러도 실제 로딩은 한 번뿐이다.

export interface PreloadProgress {
  loaded: number;
  total: number;
  /** 0~1 */
  ratio: number;
  done: boolean;
}

const objectUrls = new Map<string, string>();
const listeners = new Set<(p: PreloadProgress) => void>();

let started = false;
let loaded = 0;
const total = PRELOAD_FILES.length;
let finished = total === 0;

function snapshot(): PreloadProgress {
  return {
    loaded,
    total,
    ratio: total === 0 ? 1 : loaded / total,
    done: finished,
  };
}

function emit(): void {
  const p = snapshot();
  listeners.forEach(fn => fn(p));
}

const imageSet = new Set<string>(IMAGE_FILES);

/**
 * 이미지는 blob URL을 만들어봐야 소용이 없다 — 컴포넌트들이 `/emoticon/...` 같은
 * 원래 경로를 그대로 쓰기 때문이다. 대신 같은 URL로 Image를 디코드까지 시켜
 * 브라우저 이미지 캐시를 채워두면, 이후 <img>/CSS background가 즉시 그려진다.
 */
function loadImage(src: string): Promise<void> {
  return new Promise(resolve => {
    const img = new Image();
    const finish = () => resolve();
    img.onload = () => {
      // decode()까지 마쳐야 첫 표시에서 디코딩 지연이 생기지 않는다.
      if (typeof img.decode === 'function') img.decode().then(finish, finish);
      else finish();
    };
    img.onerror = finish;
    img.src = src;
  });
}

/** 효과음은 blob URL로 들고 있다가 재생 시 그대로 쓴다(네트워크 미사용). */
async function loadSound(src: string): Promise<void> {
  const res = await fetch(src, { cache: 'force-cache' });
  if (res.ok) objectUrls.set(src, URL.createObjectURL(await res.blob()));
}

async function loadOne(src: string): Promise<void> {
  try {
    if (imageSet.has(src)) await loadImage(src);
    else await loadSound(src);
  } catch {
    // 개별 에셋 실패는 무시한다 — 재생/표시 시 원래 경로로 폴백되고,
    // 파일 하나 때문에 로딩 화면에서 막히면 안 되기 때문이다.
  } finally {
    loaded++;
    emit();
  }
}

/** 동시 요청 수를 제한해 순차적으로 전부 받아온다. */
async function run(concurrency = 6): Promise<void> {
  let cursor = 0;
  const workers = Array.from({ length: Math.min(concurrency, total) }, async () => {
    while (cursor < total) {
      const src = PRELOAD_FILES[cursor++];
      await loadOne(src);
    }
  });
  await Promise.all(workers);
  finished = true;
  emit();
}

/** 프리로드를 시작한다(이미 시작했으면 아무것도 하지 않음). */
export function startPreload(): void {
  if (started || typeof window === 'undefined') return;
  started = true;
  if (total === 0) {
    finished = true;
    emit();
    return;
  }
  void run();
}

/** 진행 상황 구독 — 등록 즉시 현재 상태를 한 번 받는다. 해제 함수를 반환. */
export function subscribePreload(fn: (p: PreloadProgress) => void): () => void {
  listeners.add(fn);
  fn(snapshot());
  return () => listeners.delete(fn);
}

export function getPreloadProgress(): PreloadProgress {
  return snapshot();
}

/** 프리로드로 받아둔 blob URL(없으면 null — 호출부가 원래 경로로 폴백한다). */
export function getPreloadedObjectUrl(src: string): string | null {
  return objectUrls.get(src) ?? null;
}
