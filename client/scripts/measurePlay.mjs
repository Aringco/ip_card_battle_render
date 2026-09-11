// 플레이 화면 실측 — "가죽만 갈아입혔는지"를 숫자로 확인하는 도구.
//
// 플레이 화면 UI 작업(PLAY_UI_ROADMAP.md)의 제약 2는 **배치를 바꾸지 않는 것**이다.
// 눈으로는 나무 액자가 예뻐 보이는데 그리드 칸이 3px씩 밀려 있는 상황을 잡아내지
// 못하므로, 주요 상자의 위치·크기를 매번 같은 방식으로 재서 기준값과 견준다.
//
//   사용법
//     node scripts/measurePlay.mjs                     # 재고 표로 출력
//     node scripts/measurePlay.mjs --save baseline     # 지금 값을 기준값으로 저장
//     node scripts/measurePlay.mjs --diff  baseline    # 기준값과 견주어 달라진 것만
//     PLAY_URL=http://localhost:3200/ node scripts/...  # 포트 바꾸기(기본 3000)
//
// ⚠️ WS 서버(8080)가 떠 있어야 한다 — 방을 실제로 만들어 게임을 시작하기 때문이다.
// ⚠️ 헤드리스 Chrome은 webkit 스크롤바를 그리지 않는다. 스크롤 여부는 숫자로만 본다.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer-core';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CHROME =
  process.env.CHROME ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const URL_BASE = process.env.PLAY_URL ?? 'http://localhost:3000/';
const SHOT_DIR = path.join(__dirname, '..', 'play-shots');
const BASE_DIR = path.join(__dirname, '..', 'play-baselines');

const VIEWPORTS = [
  [1920, 1080],
  [1600, 900],
  [1366, 768],
];

// 재는 대상 — 셀렉터와 사람이 읽을 이름. **그리드 칸을 이루는 상자**를 우선으로 골랐다.
// 배치가 밀리면 여기 숫자가 먼저 움직인다.
const TARGETS = [
  ['header', 'header'],
  ['보드', '[data-board-root]'],
  ['팀패널A', '[data-rabbit-target="A"]'],
  ['팀패널B', '[data-rabbit-target="B"]'],
  ['장소-오두막', '[data-place-key="house"]'],
  ['장소-강가', '[data-place-key="river_road"]'],
  ['해설판', 'main > div:nth-child(4) > div'],
  ['행동띠', 'main > div:nth-child(6) > div'],
  ['체력판A', 'main > div:nth-child(5) > div'],
  ['체력판B', 'main > div:nth-child(7) > div'],
];

const args = process.argv.slice(2);
const saveAs = args.includes('--save') ? args[args.indexOf('--save') + 1] : null;
const diffWith = args.includes('--diff') ? args[args.indexOf('--diff') + 1] : null;

/** 로비에서 혼자 놀기로 들어가 실제 플레이 화면까지 간다. */
async function enterGame(page) {
  await page.goto(URL_BASE, { waitUntil: 'networkidle0' });
  await new Promise(r => setTimeout(r, 2200));
  await page.evaluate(() =>
    [...document.querySelectorAll('button')]
      .find(x => (x.textContent || '').includes('혼자 놀기'))
      ?.click(),
  );
  await new Promise(r => setTimeout(r, 1100));
  // ⚠️ 반드시 **열려 있는 폼 안에서** 찾아야 한다. 문서 전체에서 텍스트로 찾으면
  // "컴퓨터와 대전 — 지금 바로…"라고 적힌 **모드 선택 패널**이 먼저 걸려, 폼이
  // 닫히고 게임이 시작되지 않는다(실제로 한 번 이 함정에 빠졌다).
  await page.evaluate(() => {
    const form = document.querySelector('.stage-form:not([inert])') ?? document;
    [...form.querySelectorAll('button.plank-button')]
      .find(x => (x.textContent || '').includes('컴퓨터와 대전'))
      ?.click();
  });
  await new Promise(r => setTimeout(r, 4500));
  if (!/\/room\//.test(page.url())) throw new Error(`게임 진입 실패: ${page.url()}`);
}

/** 장소를 한 번 클릭해 "행동 선택" 단계까지 진행시킨다(연출이 끝날 때까지 기다린다). */
async function advanceToChoice(page) {
  const place = await page.evaluate(() => {
    const el = [...document.querySelectorAll('[data-place-key]')].find(e => !e.disabled);
    el?.click();
    return el?.getAttribute('data-place-key') ?? null;
  });
  await new Promise(r => setTimeout(r, 6000));
  return place;
}

async function measure(page) {
  return page.evaluate(targets => {
    const out = {};
    for (const [name, sel] of targets) {
      const el = document.querySelector(sel);
      if (!el) { out[name] = null; continue; }
      const b = el.getBoundingClientRect();
      out[name] = { x: Math.round(b.left), y: Math.round(b.top), w: Math.round(b.width), h: Math.round(b.height) };
    }
    const doc = document.documentElement;
    out['_page'] = {
      overflowX: doc.scrollWidth - doc.clientWidth,
      overflowY: doc.scrollHeight - doc.clientHeight,
    };
    return out;
  }, TARGETS);
}

const results = {};
const problems = [];

fs.mkdirSync(SHOT_DIR, { recursive: true });
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--no-sandbox'] });

for (const [w, h] of VIEWPORTS) {
  const page = await browser.newPage();
  const consoleErrors = [];
  page.on('pageerror', e => consoleErrors.push(String(e).slice(0, 160)));
  await page.setViewport({ width: w, height: h });
  try {
    await enterGame(page);
    // ① 장소 선택 단계
    await page.screenshot({ path: path.join(SHOT_DIR, `${w}x${h}-1-draw.png`) });
    results[`${w}x${h}/draw`] = await measure(page);
    // ② 행동 선택 단계
    await advanceToChoice(page);
    await page.screenshot({ path: path.join(SHOT_DIR, `${w}x${h}-2-choice.png`) });
    results[`${w}x${h}/choice`] = await measure(page);
  } catch (e) {
    problems.push(`${w}x${h}: ${e.message}`);
  }
  if (consoleErrors.length) problems.push(`${w}x${h} 콘솔: ${consoleErrors[0]}`);
  await page.close();
}
await browser.close();

// ── 출력 ────────────────────────────────────────────────────────────────
for (const [key, m] of Object.entries(results)) {
  console.log(`\n── ${key} ` + '─'.repeat(Math.max(0, 44 - key.length)));
  for (const [name] of TARGETS) {
    const v = m[name];
    console.log(`  ${name.padEnd(12)} ${v ? `x${String(v.x).padStart(5)} y${String(v.y).padStart(5)}  ${String(v.w).padStart(5)}×${String(v.h).padStart(4)}` : '(없음)'}`);
  }
  const p = m['_page'];
  if (p.overflowX || p.overflowY) {
    console.log(`  ⚠️ 페이지 넘침  가로 ${p.overflowX} / 세로 ${p.overflowY}`);
    problems.push(`${key}: 페이지 넘침 ${p.overflowX}/${p.overflowY}`);
  }
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
  let moved = 0;
  console.log(`\n── 기준값(${diffWith})과의 차이 ──────────────────────`);
  for (const [key, m] of Object.entries(results)) {
    for (const [name] of TARGETS) {
      const a = base[key]?.[name], b = m[name];
      if (!a || !b) continue;
      const d = ['x', 'y', 'w', 'h'].filter(k => a[k] !== b[k]);
      if (!d.length) continue;
      moved++;
      console.log(`  ${key} ${name}: ` + d.map(k => `${k} ${a[k]}→${b[k]}`).join('  '));
    }
  }
  console.log(moved === 0 ? '  움직인 상자 없음 ✅' : `  움직인 상자 ${moved}개 — 의도한 것인지 확인할 것`);
}

console.log(`\n문제: ${problems.length === 0 ? '없음' : ''}`);
for (const p of problems) console.log(`  · ${p}`);
console.log(`스크린샷: ${SHOT_DIR}`);
