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
  // 세로가 가장 빠듯한 노트북 해상도 — 폼 배율 상한이 여기서 먼저 걸린다.
  // 이 줄이 없어서 방 만들기 카드가 768 높이에서 넘치는 것을 오래 놓쳤다.
  { w: 1366, h: 768 },
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
    for (const sel of ['.stage-form-solo', '.stage-form-enhance', '.stage-form-create', '.stage-form-join', '.stage-form-event']) {
      const el = q(sel);
      if (el && getComputedStyle(el).opacity === '1') openForm = el;
    }
    // 폼 카드는 흰 배경에서 나무 액자 백보드(.lobby-form-board)로 바뀌었다.
    // 예전 [class*="bg-white"] 선택자는 이제 아무것도 못 찾아 "카드" 칸이 늘 '-'로 나온다.
    const card = openForm?.querySelector('.lobby-form-board');
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
      // 카드 **안쪽**의 스크롤(.lobby-form-scroll). 위 formScroll(.stage-form)과 다른
      // 상자다 — 화면에 실제로 초록 막대가 그려지는 쪽은 대개 이쪽이고, 예전에는 재지
      // 않아 "문제 없음"이라고 말하면서 방 만들기·방 참가하기에 스크롤바가 떠 있었다.
      cardScroll: (() => {
        const sc = openForm?.querySelector('.lobby-form-scroll');
        if (!sc) return null;
        return { v: sc.scrollHeight > sc.clientHeight + 1, over: sc.scrollHeight - sc.clientHeight };
      })(),
      pageScroll: document.documentElement.scrollHeight > document.documentElement.clientHeight + 1,
    };
  }, label);
}

/** 접힌 규칙 묶음의 머리 버튼을 누른다 — 제목 글자로 찾는다(개발자 대기실은 묶음이 셋이라 어느 것인지 고른다). */
async function openRules(page, formSel, heading = '게임 규칙') {
  for (const b of await page.$$(`${formSel} button`)) {
    const t = await page.evaluate(el => el.textContent, b);
    if (t && t.includes(heading)) { await b.click(); return; }
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

/** 팀 이름 충돌을 푼다 — 상대 팀 칸만 비우면 된다. */
async function clearTeamNameClash(page) {
  const inputs = await page.$$('.stage-form-create input[type="text"]');
  await inputs[2].click({ clickCount: 3 });
  await inputs[2].press('Backspace');
}

/**
 * 자리를 관전석으로 바꿔 안내문을 띄운다. 관전석은 기본값이 아니라서 그냥 열어두면
 * 이 상태를 한 번도 재지 못한다.
 *
 * ⚠️ 충돌 경고와 관전자 안내는 **같은 한 줄(FormCard의 description)을 나눠 쓰고**,
 * 충돌 쪽이 우선한다(그쪽은 제출을 막는 오류다). 그래서 충돌을 켜둔 채 관전석을 고르면
 * 안내가 영영 뜨지 않는다 — 반드시 충돌을 먼저 풀고 부를 것.
 */
async function pickSpectatorSeat(page, formSel) {
  // ⚠️ 자리 선택은 2026-09-09부터 **그림 버튼**이라 textContent가 비어 있다.
  //    글씨가 그림 안에 있어서, 이름은 aria-label에만 실린다 — 둘 다 본다.
  for (const b of await page.$$(`${formSel} button`)) {
    const t = await page.evaluate(el => `${el.textContent} ${el.getAttribute('aria-label') || ''}`, b);
    if (t && t.includes('관전')) { await b.click(); break; }
  }
  return page.evaluate(sel =>
    [...document.querySelectorAll(`${sel} p`)].some(p => p.textContent.includes('관전자는 지켜보기만')),
    formSel);
}

/** 방 만들기 폼의 [개인전] 토글을 누른다. 눌렸는지(aria-pressed)까지 확인한다. */
async function pickIndividualMode(page) {
  for (const b of await page.$$('.stage-form-create .mode-toggle-button')) {
    const t = await page.evaluate(el => el.textContent, b);
    if (t && t.includes('개인전')) {
      await b.click();
      return page.evaluate(el => el.getAttribute('aria-pressed') === 'true', b);
    }
  }
  return false;
}

/** 그 폼 안에서 글자가 들어간 (누를 수 있는) 버튼을 누른다. */
async function clickIn(page, formSel, text) {
  return page.evaluate((sel, text) => {
    const b = [...document.querySelectorAll(`${sel} button`)].find(x => (x.textContent || '').includes(text) && !x.disabled);
    b?.click();
    return !!b;
  }, formSel, text);
}

/** 입력칸을 비운다 — 비밀번호 칸은 세 번 클릭해도 글자가 선택되지 않아(실제로 틀린 암호 뒤에 이어 쳐졌다) Ctrl+A로 지운다. */
async function clearInput(page, sel) {
  await page.focus(sel);
  await page.keyboard.down('Control');
  await page.keyboard.press('KeyA');
  await page.keyboard.up('Control');
  await page.keyboard.press('Backspace');
}

/** 그 폼에 글자가 보이는가 — 서버의 대답으로 뜨는 화면이 실제로 떴는지 확인한다. */
async function formHas(page, formSel, text) {
  return page.evaluate((sel, text) => (document.querySelector(sel)?.textContent ?? '').includes(text), formSel, text);
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
  // 혼자 놀기도 두 갈래다(2026-10-28) — 고르는 단계(일반 모드 · 강화 모드) → 그 폼
  await page.click('.stage-col-solo > .stage-panel'); await sleep(SETTLE);
  results.push(await measure(page, `solo-pick@${tag}`));          await shot('2-solo-pick');
  await page.click('.stage-col-solo-normal > .stage-panel'); await sleep(SETTLE);
  // ⚠️ **접힌 상태를 먼저 잰다.** 규칙을 펼친 뒤에만 재면 스크롤이 "정상"으로 넘어가
  // 접힌 화면의 스크롤바를 놓친다 — 실제로 그렇게 놓쳐, 방 만들기·방 참가하기가
  // 열리자마자 초록 막대가 떠 있는데도 "문제 없음"이 나왔다.
  results.push(await measure(page, `solo@${tag}`));               await shot('2a-solo');
  await openRules(page, '.stage-form-solo');          await sleep(500);
  results.push(await measure(page, `solo+rules@${tag}`));         await shot('2-solo-rules');
  // 강화 모드 — 닉네임 + 게임 규칙(팀 이름 칸 없음). 폼은 늘 마운트돼 있어 펼친 규칙이 남으므로 일반 모드 규칙을 먼저 접는다
  await openRules(page, '.stage-form-solo');          await sleep(400);
  await page.click('.lobby-back');                    await sleep(SETTLE);
  await page.click('.stage-col-solo-enhance > .stage-panel'); await sleep(SETTLE);
  results.push(await measure(page, `enhance@${tag}`));            await shot('2c-enhance');
  await openRules(page, '.stage-form-enhance');       await sleep(500);
  results.push(await measure(page, `enhance+rules@${tag}`));      await shot('2d-enhance-rules');
  await openRules(page, '.stage-form-enhance');       await sleep(400);
  await page.click('.lobby-back');                    await sleep(SETTLE);
  await page.click('.lobby-back');                    await sleep(SETTLE);
  await page.click('.stage-panel-multi');             await sleep(SETTLE);
  results.push(await measure(page, `multi@${tag}`));              await shot('3-multi');
  await page.click('.stage-col-create > .stage-panel'); await sleep(SETTLE);
  results.push(await measure(page, `create@${tag}`));             await shot('4a-create');
  await openRules(page, '.stage-form-create');        await sleep(500);
  results.push(await measure(page, `create+rules@${tag}`));       await shot('4-create-rules');

  // 폼이 가장 높아지는 상태 — 위 create+rules에 팀 이름 충돌 경고 한 줄이 더 얹힌다
  const clashShown = await makeTeamNamesClash(page);  await sleep(400);
  const clash = await measure(page, `create+clash@${tag}`);
  clash.note = clashShown ? '' : '*** 경고 안 뜸';
  results.push(clash);                                            await shot('5-create-clash');

  // 관전석을 고른 상태 — 안내문이 설명 줄을 갈아끼우고, 팀 이름 라벨도 바뀐다.
  // 충돌을 먼저 풀어야 한다(둘이 같은 줄을 쓰고 충돌이 우선한다 — 위 주석 참고).
  await clearTeamNameClash(page);                     await sleep(300);
  const specShown = await pickSpectatorSeat(page, '.stage-form-create'); await sleep(400);
  const spec = await measure(page, `create+spectator@${tag}`);
  spec.note = specShown ? '' : '*** 관전자 안내 안 뜸';
  results.push(spec);                                             await shot('6-create-spectator');

  // 개인전을 고른 방 만들기 — 팀 이름 두 칸과 자리 선택이 사라진다. **접힌 상태를 먼저** 잰다
  // (접힌 폼은 스크롤이 잠겨 있어 넘치면 [게임 규칙] 버튼이 잘린다 — 위 주석 참고).
  await page.goto(URL_BASE, { waitUntil: 'networkidle2' });
  await page.waitForSelector('.lobby-safe', { timeout: 60000 });
  await sleep(1000);
  await page.click('.stage-panel-multi');             await sleep(SETTLE);
  await page.click('.stage-col-create > .stage-panel'); await sleep(SETTLE);
  const individualPicked = await pickIndividualMode(page); await sleep(400);
  const ind = await measure(page, `individual@${tag}`);
  ind.note = individualPicked ? '' : '*** 개인전 토글 못 찾음';
  results.push(ind);                                              await shot('6b-create-individual');
  await openRules(page, '.stage-form-create');        await sleep(500);
  results.push(await measure(page, `individual+rules@${tag}`));    await shot('6c-create-individual-rules');

  // 초대 링크 **없이** 연 참가 폼 — 평소에 보게 되는 화면이다
  await page.goto(URL_BASE, { waitUntil: 'networkidle2' });
  await page.waitForSelector('.lobby-safe', { timeout: 60000 });
  await sleep(1000);
  await page.click('.stage-panel-multi');             await sleep(SETTLE);
  await page.click('.stage-col-join > .stage-panel'); await sleep(SETTLE);
  results.push(await measure(page, `join@${tag}`));               await shot('6a-join');

  // 초대 링크로 들어온 참가 폼 — 안내 배너가 한 덩어리 더 붙는다.
  // 새로 열어야 한다(page.tsx의 ?room= 처리는 마운트 직후 한 번뿐이다).
  await page.goto(`${URL_BASE}?room=ABCD`, { waitUntil: 'networkidle2' });
  await page.waitForSelector('.lobby-safe', { timeout: 60000 });
  await sleep(1000 + SETTLE);
  const invite = await measure(page, `join+invite@${tag}`);
  // ⚠️ 방 코드 칸은 **placeholder로 찾는다.** 예전에는 `input.font-mono`로 집었는데,
  //    2026-09-09에 글꼴을 한 벌로 합치며 그 클래스를 걷어내자 곧바로 3건이 거짓 경보로
  //    떴다. 겉모습을 나타내는 클래스는 언제든 사라진다 — 화면에 보이는 값으로 짚을 것.
  const inviteOk = await page.evaluate(() => {
    const banner = [...document.querySelectorAll('.stage-form-join p')]
      .some(p => p.textContent.includes('초대 링크로 들어왔어요'));
    const code = [...document.querySelectorAll('.stage-form-join input')]
      .find(i => (i.placeholder || '').includes('ABCD'));
    return banner && code?.value === 'ABCD';
  });
  invite.note = inviteOk ? '' : '*** 안내/코드 채움 실패';
  results.push(invite);                                           await shot('7-join-invite');

  // ── 이벤트 방 참가하기(EVENT_MODE_ROADMAP.md §2.1) — 화면이 여럿이라 하나씩 연다 ──
  // ⚠️ 대기 줄·틀린 암호·닉네임 중복·개발자 대기실은 **서버의 대답**으로 뜨는 화면이라 WS 서버가 떠 있어야 한다.
  //    (개발자 암호는 EVENT_DEV_TOKEN — 개발 서버 기본값 dev1234) 안 뜨면 비고에 표시해 "재지 못했다"를 드러낸다.
  await page.goto(URL_BASE, { waitUntil: 'networkidle2' });
  await page.waitForSelector('.lobby-safe', { timeout: 60000 });
  await sleep(1000);
  await page.click('.stage-panel-multi');             await sleep(SETTLE);
  await page.click('.stage-col-event > .stage-panel'); await sleep(SETTLE);
  results.push(await measure(page, `event-role@${tag}`));         await shot('8a-event-role');
  await clickIn(page, '.stage-form-event', '도전자');  await sleep(400);
  results.push(await measure(page, `event-challenger@${tag}`));   await shot('8b-event-challenger');
  // 목표점수 달성하기를 고른 상태 — 예전엔 목표 토글이 줄 안에 붙었다. 지금은 목표를 서버가 뽑아 줄이 늘지 않아야 한다.
  await page.evaluate(() => [...document.querySelectorAll('.event-kind-button')].find(b => b.textContent.includes('목표점수'))?.click());
  await sleep(300);
  results.push(await measure(page, `event-race@${tag}`));         await shot('8c-event-race');
  // 대기 줄 — 개발자를 이겨라로 줄을 선다(대기 중인 개발자가 없으면 줄에 남는다)
  const evName = `측정${tag.replace('x', '')}`.slice(0, 12);
  const nameBox = await page.$('.stage-form-event input[type="text"]');
  await nameBox.click({ clickCount: 3 }); await nameBox.type(evName);
  await page.type('.stage-form-event input[inputmode="numeric"]', '1234');
  await page.evaluate(() => [...document.querySelectorAll('.event-kind-button')].find(b => b.textContent.includes('개발자를'))?.click());
  await clickIn(page, '.stage-form-event', '대기 줄 서기'); await sleep(900);
  const queue = await measure(page, `event-queue@${tag}`);
  queue.note = (await formHas(page, '.stage-form-event', '번째')) ? '' : '*** 대기 줄 화면 안 뜸(서버?)';
  results.push(queue);                                            await shot('8d-event-queue');
  await clickIn(page, '.stage-form-event', '줄에서 빠지기'); await sleep(500);
  // 같은 닉네임 · 다른 PIN → 설명 줄이 "이미 사용 중인 닉네임"으로 바뀐다(새 줄이 아니다)
  await clearInput(page, '.stage-form-event input[inputmode="numeric"]');
  await page.type('.stage-form-event input[inputmode="numeric"]', '9999');
  await clickIn(page, '.stage-form-event', '대기 줄 서기'); await sleep(900);
  const taken = await measure(page, `event-taken@${tag}`);
  taken.note = (await formHas(page, '.stage-form-event', '이미 사용 중인 닉네임')) ? '' : '*** 중복 안내 안 뜸(서버?)';
  results.push(taken);                                            await shot('8e-event-taken');
  // 개발자 — 암호 화면, 틀린 암호, 대기실
  await clickIn(page, '.stage-form-event', '역할');    await sleep(300);
  await clickIn(page, '.stage-form-event', '개발자');  await sleep(400);
  results.push(await measure(page, `event-devauth@${tag}`));      await shot('8f-event-devauth');
  await page.type('.stage-form-event input[type="password"]', 'wrong-token');
  await clickIn(page, '.stage-form-event', '대기 시작'); await sleep(900);
  const devErr = await measure(page, `event-devauth+err@${tag}`);
  devErr.note = (await formHas(page, '.stage-form-event', '맞지 않습니다')) ? '' : '*** 틀린 암호 안내 안 뜸(서버?)';
  results.push(devErr);                                           await shot('8g-event-devauth-error');
  await clearInput(page, '.stage-form-event input[type="password"]');
  await page.type('.stage-form-event input[type="password"]', process.env.EVENT_DEV_TOKEN ?? 'dev1234');
  await clickIn(page, '.stage-form-event', '대기 시작'); await sleep(1200);
  const devWait = await measure(page, `event-devwait@${tag}`);
  devWait.note = (await formHas(page, '.stage-form-event', '개발자 대기실')) ? '' : '*** 대기실 안 뜸(암호?)';
  results.push(devWait);                                          await shot('8h-event-devwait');
  // 개발자가 정하는 게임 규칙 — 접힌 상태는 위에서 쟀고(스크롤 없어야 한다), 펼치면 스크롤이 정상이다.
  // 묶음이 셋(개발자를 이겨라 · 목표점수 달성하기 · 한 우물만 파기 — 2026-10-27)이라 가장 긴 목표점수 쪽(목표 범위 줄이 더 있다)을 편다.
  await openRules(page, '.stage-form-event', '목표점수 달성하기 규칙'); await sleep(500);
  results.push(await measure(page, `event-devwait+rules@${tag}`)); await shot('8i-event-devwait-rules');
  await openRules(page, '.stage-form-event', '목표점수 달성하기 규칙'); await sleep(300);
  await clickIn(page, '.stage-form-event', '대기 그만두기'); await sleep(400);

  await page.close();
}
await browser.close();

let bad = 0;
console.log('label                   안전영역     카드         폼스크롤  카드스크롤  페이지스크롤  화면밖   비고');
for (const r of results) {
  const b = o => (o ? `${o.w}x${o.h}` : '-');
  // 규칙을 **펼친** 상태의 폼 스크롤은 2026-09-08부터 의도된 동작이다 — 펼치면 카드
  // 크기를 그대로 두고 넘치는 만큼 스크롤한다(globals.css의 data-rules-open 절).
  // 예전처럼 이것을 문제로 세면 매번 12건이 떠서 진짜 문제를 덮는다.
  // 규칙을 **접은** 상태(join+invite 등)에서 스크롤이 생기면 그때가 진짜 문제다.
  const scrollExpected = /\+rules|\+clash|\+spectator/.test(r.label);
  const formScrollBad = !!r.formScroll?.v && !scrollExpected;
  const cardScrollBad = !!r.cardScroll?.v && !scrollExpected;
  if (formScrollBad || cardScrollBad || r.pageScroll || r.offscreen || r.note) bad++;
  console.log(
    r.label.padEnd(23),
    b(r.safe).padEnd(12),
    b(r.card).padEnd(12),
    (r.formScroll ? (r.formScroll.v ? (scrollExpected ? 'yes(정상)' : '*** YES') : 'no') : '-').padEnd(9),
    (r.cardScroll ? (r.cardScroll.v ? (scrollExpected ? `yes(정상 +${r.cardScroll.over})` : `*** YES +${r.cardScroll.over}`) : 'no') : '-').padEnd(11),
    (r.pageScroll ? '*** YES' : 'no').padEnd(13),
    (r.offscreen ? '*** YES' : 'no').padEnd(8),
    r.note ?? '',
  );
}
console.log(`\n문제: ${bad === 0 ? '없음' : bad + '건'}`);
console.log(`콘솔 에러: ${errors.length ? errors.join('\n  ') : '없음'}`);
console.log(`스크린샷: ${OUT}`);
process.exit(bad === 0 && errors.length === 0 ? 0 : 1);
