// 개인전 게임 화면 실측 도구 — 다같이 놀기로 개인전 방을 만들어 N명이 들어가 시작한 뒤,
// 해상도마다 오른쪽 상대 칸이 넘치지 않는지·화면이 스크롤되지 않는지를 숫자로 잰다.
//
// 팀전의 measurePlay.mjs는 혼자 놀기(팀전)로만 들어가므로 개인전은 이 스크립트가 맡는다
// (INDIVIDUAL_MODE_ROADMAP.md T5-4). 브라우저 창(탭) 여러 개가 한 방에 들어간다.
//
// 사용법:
//   1) WS 서버(8080)와 화면(3000)을 띄운다 — dev 서버로 재면 낡은 CSS를 내줄 수 있으니
//      값이 이상하면 `npm run dev:clean`으로 다시 띄울 것(CLAUDE.md).
//   2) cd client && node scripts/measureIndividual.mjs            (인원 2·5·8, 해상도 둘)
//      PLAY_URL=http://localhost:3000/ node scripts/measureIndividual.mjs 2 5 8
//
// 스크린샷은 client/individual-shots/ 에 남는다(.gitignore 대상이 아니면 커밋하지 말 것).

import fs from 'node:fs';
import path from 'node:path';

const URL_BASE = process.env.PLAY_URL ?? 'http://localhost:3000/';
const CHROME = process.env.CHROME_PATH ?? 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const OUT = path.resolve('individual-shots');
const COUNTS = process.argv.slice(2).map(Number).filter(n => n >= 2 && n <= 8);
const SIZES = COUNTS.length > 0 ? COUNTS : [2, 5, 8];
const VIEWPORTS = [
  { w: 1600, h: 900 },
  { w: 1366, h: 768 },
];
const sleep = ms => new Promise(r => setTimeout(r, ms));

const { default: puppeteer } = await import('puppeteer-core');
fs.mkdirSync(OUT, { recursive: true });
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--no-sandbox'] });
const errors = [];

async function open(name, vp) {
  const page = await browser.newPage();
  await page.setViewport({ width: vp.w, height: vp.h });
  page.on('pageerror', e => errors.push(`${name} PAGEERROR ${String(e).slice(0, 160)}`));
  page.on('console', m => { if (m.type() === 'error') errors.push(`${name} ${m.text().slice(0, 160)}`); });
  await page.goto(URL_BASE, { waitUntil: 'networkidle2' });
  await page.waitForSelector('.lobby-safe', { timeout: 60000 });
  await sleep(600);
  return page;
}
const clickText = (page, scope, text) => page.evaluate((scope, text) => {
  const root = document.querySelector(scope) ?? document;
  const el = [...root.querySelectorAll('button')].find(b => (b.textContent || '').includes(text));
  el?.click(); return !!el;
}, scope, text);

/** 방장 화면(첫 창)을 재는 함수 — 페이지 안에서 돈다. */
const measure = () => {
  const box = el => {
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) };
  };
  const frame = document.querySelector('.play-frame-css');
  const list = document.querySelector('.ind-opp-list');
  const cards = [...document.querySelectorAll('.ind-opp-card')];
  const fb = box(frame);
  return {
    frame: fb,
    frameInViewport: fb ? fb.x >= -1 && fb.y >= -1 && fb.x + fb.w <= innerWidth + 1 && fb.y + fb.h <= innerHeight + 1 : false,
    pageScroll: document.documentElement.scrollHeight > document.documentElement.clientHeight + 1,
    cards: cards.length,
    listOverflow: list ? list.scrollHeight > list.clientHeight + 1 : null,
    cardClipped: cards.filter(c => c.scrollHeight > c.clientHeight + 1).length,
    mainClipped: cards.filter(c => {
      const m = c.querySelector('.ind-opp-main');
      return m ? m.scrollHeight > m.clientHeight + 1 : false;
    }).length,
    namesTruncated: cards.filter(c => {
      const n = c.querySelector('.ind-opp-name');
      return n ? n.scrollWidth > n.clientWidth + 1 : false;
    }).length,
    cardH: cards[0] ? Math.round(cards[0].getBoundingClientRect().height) : null,
    // 첫 칸의 속사정 — "본문잘림"이 뜨면 어느 줄이 모자란지 여기서 본다.
    detail: (() => {
      const c = cards[0];
      if (!c) return null;
      const h = el => (el ? Math.round(el.getBoundingClientRect().height * 10) / 10 : null);
      const main = c.querySelector('.ind-opp-main');
      const animals = c.querySelector('.ind-opp-animals');
      const cell = c.querySelector('.ind-animal');
      return {
        card: h(c), mainClient: main?.clientHeight, mainScroll: main?.scrollHeight,
        nameRow: h(c.querySelector('.ind-opp-name-row')), animals: h(animals),
        cellClient: cell?.clientHeight, cellScroll: cell?.scrollHeight,
        cellKids: cell ? [...cell.children].map(k => `${k.className.split(' ')[0]}:${h(k)}`) : [],
        fontScale: getComputedStyle(document.documentElement).getPropertyValue('--font-scale').trim(),
      };
    })(),
  };
};

const rows = [];
for (const n of SIZES) {
  for (const vp of VIEWPORTS) {
    const pages = [];
    const host = await open('p1', vp);
    await host.click('.stage-panel-multi'); await sleep(900);
    await host.click('.stage-col-create > .stage-panel'); await sleep(900);
    const inputs = await host.$$('.stage-form-create input[type="text"]');
    await inputs[0].type('방장');
    await clickText(host, '.stage-form-create', '개인전'); await sleep(300);
    await clickText(host, '.stage-form-create', '방 만들기'); await sleep(1500);
    const code = await host.evaluate(() => document.querySelector('.waiting-board .text-6xl')?.textContent?.trim());
    pages.push(host);
    for (let i = 2; i <= n; i++) {
      const g = await open(`p${i}`, vp);
      await g.goto(`${URL_BASE}?room=${code}`, { waitUntil: 'networkidle2' });
      await g.waitForSelector('.lobby-safe'); await sleep(1200);
      const ins = await g.$$('.stage-form-join input[type="text"]');
      await ins[0].type(`참가자${i}`);
      await clickText(g, '.stage-form-join', '입장하기'); await sleep(900);
      pages.push(g);
    }
    for (const g of pages.slice(1)) await clickText(g, '.waiting-board', '준비');
    await sleep(500);
    await clickText(host, '.waiting-board', '게임 시작'); await sleep(3500);

    const m = await host.evaluate(measure);
    await host.screenshot({ path: path.join(OUT, `${n}p-${vp.w}x${vp.h}.png`) });
    rows.push({ n, vp, ...m });
    for (const p of pages) await p.close();
  }
}
await browser.close();

if (process.env.DETAIL) for (const r of rows) console.log(r.n, `${r.vp.w}x${r.vp.h}`, JSON.stringify(r.detail));
let bad = 0;
console.log('인원  해상도     프레임        화면안  페이지스크롤  상대칸  열넘침  칸잘림  본문잘림  이름잘림  칸높이');
for (const r of rows) {
  const f = r.frame ? `${r.frame.w}x${r.frame.h}` : '-';
  const problem =
    !r.frame || !r.frameInViewport || r.pageScroll || r.cards !== r.n - 1 || r.listOverflow || r.cardClipped > 0 || r.mainClipped > 0;
  if (problem) bad++;
  console.log(
    String(r.n).padEnd(5),
    `${r.vp.w}x${r.vp.h}`.padEnd(10),
    f.padEnd(13),
    (r.frameInViewport ? 'yes' : '*** NO').padEnd(7),
    (r.pageScroll ? '*** YES' : 'no').padEnd(13),
    `${r.cards}/${r.n - 1}`.padEnd(7),
    (r.listOverflow ? '*** YES' : 'no').padEnd(7),
    String(r.cardClipped).padEnd(7),
    String(r.mainClipped).padEnd(9),
    String(r.namesTruncated).padEnd(9),
    r.cardH ?? '-',
  );
}
console.log(`\n문제: ${bad === 0 ? '없음' : bad + '건'}`);
console.log(`콘솔 에러: ${errors.length ? errors.slice(0, 6).join('\n  ') : '없음'}`);
console.log(`스크린샷: ${OUT}`);
process.exit(bad === 0 && errors.length === 0 ? 0 : 1);
