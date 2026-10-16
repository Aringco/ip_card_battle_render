// 모바일 실측 — 폰·폴드·태블릿에서 플레이 화면이 실제로 성립하는지를 숫자로 확인하는 도구.
//
// `measurePlay.mjs`가 "데스크톱에서 상자가 움직였는가"만 보는 데 비해, 이쪽은 작은 화면에서
// **실제로 읽히고 눌리는가**를 본다. 계획과 단계(Tier) 정의는 `MOBILE_ROADMAP.md`에 있다.
//
//   사용법
//     node scripts/measureMobile.mjs                    # 재고 표로 출력
//     node scripts/measureMobile.mjs --save mobile-M3   # 지금 값을 기준값으로 저장
//     node scripts/measureMobile.mjs --diff mobile-M3   # 기준값과 견주어 달라진 것만
//     node scripts/measureMobile.mjs --only T2          # 특정 단계만 (T0/T1/T2/T3)
//     PLAY_URL=http://localhost:3200/ node scripts/...   # 포트 바꾸기(기본 3000)
//
// ⚠️ WS 서버(8080)가 떠 있어야 한다 — 방을 실제로 만들어 게임을 시작하기 때문이다.
// ⚠️ 헤드리스 Chrome은 모바일 **크기**만 흉내 낸다. iOS 오디오·Safari 전용 CSS·성능은
//    이 스크립트로 알 수 없다(MOBILE_ROADMAP.md의 M8).
//
// ── 무엇을 "문제"로 세는가 (MOBILE_ROADMAP.md §3-3 · §5) ─────────────────────
//   1. 칸 이탈   — 글자가 자기 칸(.play-cell / .play-cards / .play-prompt-strip) 밖으로 2px 넘게 나감
//   2. 작은 글자 — 보이는 글자가 11px 미만(필수 등급) / 10px 미만(전체)
//   3. 작은 버튼 — 누르는 대상이 44×44 미만 (Apple HIG 44pt · Material 48dp 중 낮은 쪽)
//   4. 페이지 넘침 — scrollWidth/Height가 clientWidth/Height를 넘음
//
// ⚠️ 숨긴 글자(display:none·visibility:hidden·opacity:0·크기 0)는 세지 않는다 — 작은 화면에서
//    부차 정보를 **숨기는 것이 해법**이라(§3-3), 숨긴 것을 "너무 작다"고 세면 해법이 문제가 된다.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer-core';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CHROME =
  process.env.CHROME ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const URL_BASE = process.env.PLAY_URL ?? 'http://localhost:3000/';
const SHOT_DIR = path.join(__dirname, '..', 'play-shots-mobile');
const BASE_DIR = path.join(__dirname, '..', 'play-baselines');

// [단계, 이름, 폭, 높이, DPR] — 단계 정의와 경계 계산은 MOBILE_ROADMAP.md §3-1·부록 B.
// ⚠️ 폴드 펼침 크기는 **근사값**이다. 실기기로 한 번 확인할 것.
const DEVICES = [
  ['T0', 'Fold펼침-가로', 1104, 884, 2.5],   // 데스크톱 규칙이 그대로 적용되는지 확인용
  ['T1', 'Fold펼침-세로', 884, 1104, 2.5],
  ['T1', 'iPad-가로', 1024, 768, 2],
  ['T2', 'iPhone15-가로', 844, 390, 3],
  ['T2', 'S23-가로', 780, 360, 3],
  ['T2', 'SE-가로', 667, 375, 2],
  ['T2', 'Fold접힘-가로', 882, 344, 3],
  ['T3', 'iPhone15-세로', 390, 844, 3],
  ['T3', 'SE-세로', 375, 667, 2],
  ['T3', 'S23-세로', 360, 780, 3],
  ['T3', 'Fold접힘-세로', 344, 882, 3],
];

// 자리(상자)를 재는 대상 — measurePlay.mjs와 같은 셀렉터를 쓴다.
// ⚠️ 자리 기반 셀렉터(`main > div:nth-child(n)`)를 쓰지 말 것 — 구조가 바뀌면 조용히 null이 된다.
const TARGETS = [
  ['액자', '.play-frame'],
  ['보드', '[data-board-root]'],
  ['카드띠', '.play-cards'],
  ['안내쪽지', '.play-prompt-strip'],
];

const args = process.argv.slice(2);
const saveAs = args.includes('--save') ? args[args.indexOf('--save') + 1] : null;
const diffWith = args.includes('--diff') ? args[args.indexOf('--diff') + 1] : null;
const onlyTier = args.includes('--only') ? args[args.indexOf('--only') + 1] : null;

/** 로비에서 혼자 놀기로 들어가 실제 플레이 화면까지 간다(measurePlay.mjs와 같은 경로). */
async function enterGame(page) {
  await page.goto(URL_BASE, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await new Promise(r => setTimeout(r, 5000));
  await page.evaluate(() =>
    [...document.querySelectorAll('button')]
      .find(x => (x.textContent || '').includes('혼자 놀기'))
      ?.click(),
  );
  await new Promise(r => setTimeout(r, 1300));
  // ⚠️ 반드시 **열려 있는 폼 안에서** 찾아야 한다 — 문서 전체에서 찾으면 모드 선택 패널이
  //    먼저 걸려 폼이 닫힌다(measurePlay.mjs의 같은 주석 참고).
  await page.evaluate(() => {
    const form = document.querySelector('.stage-form:not([inert])') ?? document;
    [...form.querySelectorAll('button.plank-button')]
      .find(x => (x.textContent || '').includes('컴퓨터와 대전'))
      ?.click();
  });
  await new Promise(r => setTimeout(r, 5000));
  if (!/\/room\//.test(page.url())) throw new Error(`게임 진입 실패: ${page.url()}`);
}

/** 장소를 한 번 눌러 "행동 선택" 단계까지 진행시킨다(연출이 끝날 때까지 기다린다). */
async function advanceToChoice(page) {
  await page.evaluate(() => {
    const el = [...document.querySelectorAll('[data-place-key]')].find(e => !e.disabled);
    el?.click();
  });
  await new Promise(r => setTimeout(r, 6500));
}

async function measure(page) {
  return page.evaluate(targets => {
    const round = n => Math.round(n);
    const rect = el => el.getBoundingClientRect();

    /** 화면에 실제로 보이는가 — 숨긴 것을 "작다"고 세지 않기 위한 판정. */
    function visible(el) {
      const cs = getComputedStyle(el);
      if (cs.visibility === 'hidden' || cs.display === 'none') return false;
      if (parseFloat(cs.opacity) === 0) return false;
      // ⚠️ `aria-hidden`이 붙은 것은 **읽으라고 놓은 글자가 아니다**(단계 사이의 화살표
      //    ">>>" 같은 장식 글리프). 그런 것까지 "너무 작다"고 세면, 고칠 수도 없고 고칠
      //    이유도 없는 항목이 영원히 빨간불로 남는다.
      if (el.closest('[aria-hidden="true"]')) return false;
      const b = rect(el);
      if (b.width < 1 || b.height < 1) return false;
      // 조상이 숨겨져 있으면 자신은 보인다고 나와도 화면에 없다.
      for (let p = el.parentElement; p; p = p.parentElement) {
        const pc = getComputedStyle(p);
        if (pc.display === 'none' || pc.visibility === 'hidden' || parseFloat(pc.opacity) === 0) return false;
      }
      return true;
    }

    /** 직접 텍스트 노드를 가진 요소만 — 부모까지 세면 같은 글자를 여러 번 센다. */
    function ownsText(el) {
      return [...el.childNodes].some(n => n.nodeType === 3 && n.textContent.trim().length > 0);
    }

    const out = { boxes: {}, fonts: [], overflowText: [], smallTargets: [] };

    for (const [name, sel] of targets) {
      const el = document.querySelector(sel);
      if (!el) { out.boxes[name] = null; continue; }
      const b = rect(el);
      out.boxes[name] = { x: round(b.left), y: round(b.top), w: round(b.width), h: round(b.height) };
    }

    // ── 글자 크기 + 칸 이탈 ────────────────────────────────────────────────
    // 칸은 "내용을 가둬야 하는 상자"다. 여기서 2px 넘게 나가면 옆 칸이나 나무 액자를 침범한다.
    const boxesToCheck = [
      ...[...document.querySelectorAll('.play-cell')].map(e => [e.className.match(/play-cell-[\w-]+/)?.[0] ?? '칸', e]),
      ...[...document.querySelectorAll('.play-cards-grid > *')].map((e, i) => [`카드${i + 1}`, e]),
      [`안내쪽지`, document.querySelector('.play-prompt-strip')],
      [`들보`, document.querySelector('.play-beam')],
    ].filter(([, e]) => e);

    for (const [boxName, boxEl] of boxesToCheck) {
      const bb = rect(boxEl);
      // ⚠️ 안내 쪽지만 **가로 넘침만** 센다. 이 띠가 앉는 자리는 보드와 카드 줄 사이의
      //    가로 들보 한 줄(FHD 43px)인데, 타이머 창은 그보다 키가 커서 **위아래로 걸치도록
      //    설계돼 있다**(globals.css의 `.play-prompt-strip` 주석 — "표지판처럼 걸린다").
      //    그 걸침을 문제로 세면 처음부터 고칠 수 없는 항목이 영원히 빨간불로 남는다.
      const horizontalOnly = boxName === '안내쪽지';
      for (const el of boxEl.querySelectorAll('*')) {
        if (!ownsText(el) || !visible(el)) continue;
        const b = rect(el);
        const px = parseFloat(getComputedStyle(el).fontSize);
        const text = el.textContent.trim().replace(/\s+/g, ' ').slice(0, 16);
        out.fonts.push({ px: Math.round(px * 10) / 10, text, box: boxName });
        const over = horizontalOnly
          ? Math.max(bb.left - b.left, b.right - bb.right)
          : Math.max(bb.left - b.left, b.right - bb.right, bb.top - b.top, b.bottom - bb.bottom);
        if (over > 2) out.overflowText.push({ box: boxName, text, over: round(over) });
      }
    }
    out.fonts.sort((a, b) => a.px - b.px);

    // ── 누름 대상 크기 ──────────────────────────────────────────────────────
    const tapSels = [
      ['장소', '[data-place-key]'],
      ['기술카드', '.play-cards-grid button'],
      ['시연-계속', '.demo-caption-button'],
      ['시연-결말', '.demo-scene-card'],
      ['버튼', 'header button, .pause-open, [aria-label]'],
    ];
    for (const [kind, sel] of tapSels) {
      for (const el of document.querySelectorAll(sel)) {
        if (!visible(el) || el.disabled) continue;
        const b = rect(el);
        if (b.width < 44 || b.height < 44) {
          out.smallTargets.push({ kind, w: round(b.width), h: round(b.height), text: el.textContent.trim().slice(0, 10) || (el.getAttribute('aria-label') ?? '') });
        }
      }
    }

    const doc = document.documentElement;
    const beam = document.querySelector('.play-beam');
    const frame = document.querySelector('.play-frame');
    out.page = {
      overflowX: doc.scrollWidth - doc.clientWidth,
      overflowY: doc.scrollHeight - doc.clientHeight,
      stageW: frame ? round(rect(frame).width) : 0,
      usedH: beam && frame ? Math.round(((rect(beam).height + rect(frame).height) / innerHeight) * 100) : 0,
      rotateHint: !!document.querySelector('.rotate-hint:not([hidden])') &&
        getComputedStyle(document.querySelector('.rotate-hint')).display !== 'none',
    };
    return out;
  }, TARGETS);
}

const results = {};
const problems = [];

fs.mkdirSync(SHOT_DIR, { recursive: true });
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--no-sandbox'] });

for (const [tier, name, w, h, dpr] of DEVICES) {
  if (onlyTier && tier !== onlyTier) continue;
  const page = await browser.newPage();
  const consoleErrors = [];
  page.on('pageerror', e => consoleErrors.push(String(e).slice(0, 160)));
  await page.setViewport({ width: w, height: h, deviceScaleFactor: dpr, isMobile: true, hasTouch: true });
  try {
    await enterGame(page);
    await page.screenshot({ path: path.join(SHOT_DIR, `${tier}-${name}-1-draw.png`) });
    results[`${tier}/${name}/draw`] = await measure(page);
    await advanceToChoice(page);
    await page.screenshot({ path: path.join(SHOT_DIR, `${tier}-${name}-2-choice.png`) });
    results[`${tier}/${name}/choice`] = await measure(page);
  } catch (e) {
    problems.push(`${tier}/${name}: ${e.message}`);
  }
  if (consoleErrors.length) problems.push(`${tier}/${name} 콘솔: ${consoleErrors[0]}`);
  await page.close();
}
await browser.close();

// ── 출력 ────────────────────────────────────────────────────────────────────
for (const [key, m] of Object.entries(results)) {
  const p = m.page;
  const small10 = m.fonts.filter(f => f.px < 10);
  const small11 = m.fonts.filter(f => f.px < 11);
  const flag = (n, ok = 0) => (n > ok ? '⚠️ ' : '   ');

  console.log(`\n── ${key} ` + '─'.repeat(Math.max(0, 40 - key.length)));
  console.log(`   무대 ${p.stageW}px · 세로 점유 ${p.usedH}%` + (p.rotateHint ? ' · 회전 안내 ON' : ''));
  // ⚠️ 회전 안내가 화면을 덮고 있으면 그 **아래**는 사용자에게 보이지 않는다. 그걸
  //    문제로 세면 T3가 영원히 빨간불로 남아 신호가 쓸모없어진다(세로 전용 배치는
  //    MOBILE_ROADMAP.md의 M6이고, 그때 이 안내가 꺼지면서 아래 숫자가 다시 뜻을 갖는다).
  if (p.rotateHint) {
    console.log('   (세로 화면은 "가로로 돌려 주세요" 안내가 덮고 있다 — 아래 화면은 M6 대상)');
    continue;
  }
  console.log(`${flag(p.overflowX + p.overflowY)}페이지 넘침  가로 ${p.overflowX} / 세로 ${p.overflowY}`);
  console.log(`${flag(m.overflowText.length)}칸 이탈      ${m.overflowText.length}건` +
    (m.overflowText.length ? '  ' + m.overflowText.slice(0, 5).map(o => `${o.box}"${o.text}"+${o.over}`).join(' / ') : ''));
  // ⚠️ **빨간불의 기준은 10px이다**(11px이 아니다). MOBILE_ROADMAP.md §3-3은 글자를
  //    등급으로 나눠 필수는 11px, 중요는 10px를 바닥으로 삼는데, 어느 글자가 어느
  //    등급인지는 CSS만 보고 기계가 알 수 없다. 그래서 여기서 세는 것은 "누구도 넘으면
  //    안 되는" 10px 하나이고, 필수 등급의 11px는 CSS에서 요소별로 직접 박아 두었다
  //    (`.exp-row-lv-num`·`.skill-text-title`). 11px 미만 수는 참고로만 적는다.
  console.log(`${flag(small10.length)}작은 글자    10px 미만 ${small10.length} · (참고) 11px 미만 ${small11.length} / 보이는 글자 ${m.fonts.length}개`);
  if (m.fonts.length) console.log(`             가장 작은: ` + m.fonts.slice(0, 3).map(f => `${f.px}px"${f.text}"`).join(' · '));
  console.log(`${flag(m.smallTargets.length)}작은 버튼    ${m.smallTargets.length}건` +
    (m.smallTargets.length ? '  ' + m.smallTargets.slice(0, 4).map(t => `${t.kind} ${t.w}×${t.h}`).join(' / ') : ''));
}

if (saveAs) {
  fs.mkdirSync(BASE_DIR, { recursive: true });
  const f = path.join(BASE_DIR, `${saveAs}.json`);
  fs.writeFileSync(f, JSON.stringify(results, null, 1), 'utf8');
  console.log(`\n기준값 저장: ${f}`);
}

if (diffWith) {
  const f = path.join(BASE_DIR, `${diffWith}.json`);
  const base = JSON.parse(fs.readFileSync(f, 'utf8'));
  console.log(`\n── 기준값(${diffWith})과의 차이 ──────────────────────`);
  let moved = 0;
  for (const [key, m] of Object.entries(results)) {
    const a = base[key];
    if (!a) continue;
    for (const [name] of TARGETS) {
      const x = a.boxes?.[name], y = m.boxes?.[name];
      if (!x || !y) continue;
      const d = ['x', 'y', 'w', 'h'].filter(k => x[k] !== y[k]);
      if (d.length) { moved++; console.log(`  ${key} ${name}: ` + d.map(k => `${k} ${x[k]}→${y[k]}`).join('  ')); }
    }
    const ds = [
      ['칸 이탈', a.overflowText.length, m.overflowText.length],
      ['11px 미만', a.fonts.filter(f => f.px < 11).length, m.fonts.filter(f => f.px < 11).length],
      ['작은 버튼', a.smallTargets.length, m.smallTargets.length],
    ].filter(([, x, y]) => x !== y);
    for (const [label, x, y] of ds) console.log(`  ${key} ${label}: ${x} → ${y}${y < x ? ' ✅' : ' ⚠️'}`);
  }
  console.log(moved === 0 ? '  움직인 상자 없음 ✅' : `  움직인 상자 ${moved}개`);
}

// ── 종합 ────────────────────────────────────────────────────────────────────
let bad = 0;
let covered = 0;
for (const m of Object.values(results)) {
  if (m.page.rotateHint) { covered++; continue; }   // 위와 같은 이유로 세지 않는다
  const n = m.overflowText.length + m.smallTargets.length + m.fonts.filter(f => f.px < 10).length +
    m.page.overflowX + m.page.overflowY;
  if (n > 0) bad++;
}
console.log(`\n문제 있는 화면: ${bad} / ${Object.keys(results).length - covered}` +
  (covered ? `  (회전 안내로 덮인 화면 ${covered}개는 제외)` : ''));
for (const p of problems) console.log(`  · ${p}`);
console.log(`스크린샷: ${SHOT_DIR}`);
