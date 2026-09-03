// 로비 레이아웃 실측 도구 — 폼에 항목을 추가한 뒤 스크롤바가 생기지 않는지 확인한다.
//
// 폼(.stage-form)은 position:absolute라 스테이지 박스를 밀어낼 수 없다. 그래서 항목을
// 하나만 더해도 조용히 잘리거나 스크롤바가 생기는데, 눈으로는 잘 안 보인다.
// 이 스크립트가 실제 Chrome을 띄워 각 단계·뷰포트의 박스를 재고 스크린샷을 남긴다.
//
// 사용법:
//   1) 프로덕션 빌드를 띄운다  : npx next build && npx next start -p 3200
//   2) 다른 터미널에서 실행     : node scripts/measureLobby.mjs
//      (포트를 바꾸려면)        : LOBBY_URL=http://localhost:3000/ node scripts/measureLobby.mjs
//
// dev 서버로 재면 Turbopack이 낡은 CSS 청크를 내주는 경우가 있어 값이 코드와 안 맞을 수
// 있다. 값이 이상하면 .next를 지우고 프로덕션 빌드로 다시 잴 것.
//
// puppeteer-core가 없으면: npm i -D puppeteer-core

import fs from 'node:fs';
import path from 'node:path';

const URL_BASE = process.env.LOBBY_URL ?? 'http://localhost:3200/';
const CHROME = process.env.CHROME_PATH ?? 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const OUT = path.resolve('lobby-shots');
const SETTLE = 900; // 확장 300ms + 폼 페이드 200ms 가 끝나고도 남는 여유
const sleep = ms => new Promise(r => setTimeout(r, ms));

const VIEWPORTS = [
  { w: 1280, h: 900 },
  { w: 1920, h: 1080 },
  { w: 390, h: 844 },
];

async function measure(page, label) {
  return page.evaluate(label => {
    const q = s => document.querySelector(s);
    const box = el => {
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) };
    };
    let openForm = null;
    for (const sel of ['.stage-form-solo', '.stage-form-create', '.stage-form-join']) {
      const el = q(sel);
      if (el && getComputedStyle(el).opacity === '1') openForm = el;
    }
    const card = openForm?.querySelector('[class*="bg-white"]');
    const safe = box(q('.lobby-safe'));
    return {
      label,
      viewport: { w: innerWidth, h: innerHeight },
      safe,
      card: box(card),
      // 안전영역이 화면 밖으로 나갔는가 (좁은 화면에서 테이블 확대 시 발생했던 문제)
      offscreen: safe
        ? safe.x < -2 || safe.y < -2 || safe.x + safe.w > innerWidth + 2 || safe.y + safe.h > innerHeight + 2
        : false,
      formScroll: openForm
        ? { v: openForm.scrollHeight > openForm.clientHeight + 1, scrollH: openForm.scrollHeight, clientH: openForm.clientHeight }
        : null,
      pageScroll: document.documentElement.scrollHeight > document.documentElement.clientHeight + 1,
    };
  }, label);
}

async function openRules(page, formSel) {
  for (const b of await page.$$(`${formSel} button`)) {
    const t = await page.evaluate(el => el.textContent, b);
    if (t && t.includes('게임 규칙')) { await b.click(); return; }
  }
}

/**
 * 두 팀 이름 칸에 같은 값을 넣어 충돌 경고를 띄운다 — 이 경고가 폼에서 가장 키가 큰
 * 상태를 만든다(방 만들기 + 규칙 펼침 + 경고 한 줄). 경고가 실제로 떴는지까지 확인하는
 * 이유는, 안 뜬 채로 재면 "문제 없음"으로 보이지만 아무것도 재지 못한 것이기 때문이다.
 */
async function makeTeamNamesClash(page) {
  const inputs = await page.$$('.stage-form-create input[type="text"]');
  // [0]=닉네임 [1]=우리 팀 이름 [2]=상대 팀 이름
  for (const idx of [1, 2]) {
    await inputs[idx].click({ clickCount: 3 });
    await inputs[idx].type('특허나라');
  }
  return page.evaluate(() =>
    [...document.querySelectorAll('.stage-form-create p')].some(p => p.textContent.includes('두 팀 이름이 같아요')));
}

const { default: puppeteer } = await import('puppeteer-core');
fs.mkdirSync(OUT, { recursive: true });

const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new' });
const results = [];
const errors = [];

for (const vp of VIEWPORTS) {
  const page = await browser.newPage();
  await page.setViewport({ width: vp.w, height: vp.h });
  page.on('pageerror', e => errors.push(`${vp.w}x${vp.h} PAGEERROR: ${e.message}`));
  page.on('console', m => { if (m.type() === 'error') errors.push(`${vp.w}x${vp.h} ${m.text()}`); });

  await page.goto(URL_BASE, { waitUntil: 'networkidle2' });
  await page.waitForSelector('.lobby-safe', { timeout: 60000 }); // LoadingScreen 통과 대기
  await sleep(1000);

  const tag = `${vp.w}x${vp.h}`;
  const shot = n => page.screenshot({ path: path.join(OUT, `${tag}-${n}.png`) });

  results.push(await measure(page, `home@${tag}`));               await shot('1-home');
  await page.click('.stage-col-solo > .stage-panel'); await sleep(SETTLE);
  await openRules(page, '.stage-form-solo');          await sleep(500);
  results.push(await measure(page, `solo+rules@${tag}`));         await shot('2-solo-rules');
  await page.click('.lobby-back');                    await sleep(SETTLE);
  await page.click('.stage-panel-multi');             await sleep(SETTLE);
  results.push(await measure(page, `multi@${tag}`));              await shot('3-multi');
  await page.click('.stage-col-create > .stage-panel'); await sleep(SETTLE);
  await openRules(page, '.stage-form-create');        await sleep(500);
  results.push(await measure(page, `create+rules@${tag}`));       await shot('4-create-rules');

  // 폼이 가장 높아지는 상태 — 위 create+rules에 팀 이름 충돌 경고 한 줄이 더 얹힌다
  const clashShown = await makeTeamNamesClash(page);  await sleep(400);
  const clash = await measure(page, `create+clash@${tag}`);
  clash.note = clashShown ? '' : '*** 경고 안 뜸';
  results.push(clash);                                            await shot('5-create-clash');

  // 초대 링크로 들어온 참가 폼 — 안내 배너가 한 덩어리 더 붙는다.
  // 새로 열어야 한다(page.tsx의 ?room= 처리는 마운트 직후 한 번뿐이다).
  await page.goto(`${URL_BASE}?room=ABCD`, { waitUntil: 'networkidle2' });
  await page.waitForSelector('.lobby-safe', { timeout: 60000 });
  await sleep(1000 + SETTLE);
  const invite = await measure(page, `join+invite@${tag}`);
  const inviteOk = await page.evaluate(() =>
    [...document.querySelectorAll('.stage-form-join p')].some(p => p.textContent.includes('초대 링크로 들어왔어요'))
    && document.querySelector('.stage-form-join input.font-mono')?.value === 'ABCD');
  invite.note = inviteOk ? '' : '*** 안내/코드 채움 실패';
  results.push(invite);                                           await shot('6-join-invite');

  await page.close();
}
await browser.close();

let bad = 0;
console.log('label                   안전영역     카드         폼스크롤  페이지스크롤  화면밖   비고');
for (const r of results) {
  const b = o => (o ? `${o.w}x${o.h}` : '-');
  if (r.formScroll?.v || r.pageScroll || r.offscreen || r.note) bad++;
  console.log(
    r.label.padEnd(23),
    b(r.safe).padEnd(12),
    b(r.card).padEnd(12),
    (r.formScroll ? (r.formScroll.v ? '*** YES' : 'no') : '-').padEnd(9),
    (r.pageScroll ? '*** YES' : 'no').padEnd(13),
    (r.offscreen ? '*** YES' : 'no').padEnd(8),
    r.note ?? '',
  );
}
console.log(`\n문제: ${bad === 0 ? '없음' : bad + '건'}`);
console.log(`콘솔 에러: ${errors.length ? errors.join('\n  ') : '없음'}`);
console.log(`스크린샷: ${OUT}`);
process.exit(bad === 0 && errors.length === 0 ? 0 : 1);
