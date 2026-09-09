'use client';

import { useEffect, useRef, useState } from 'react';
import type { GameSettings, Team } from 'shared';
import { DEFAULT_SETTINGS, SETTINGS_LIMITS } from 'shared';
import { UiIcon } from '@/components/ui/UiIcon';
import { LOBBY_ASSETS } from '@/lib/lobbyAssets';

// 선 플레이어(먼저 시작하는 팀) — 숫자가 아니라 3지선다라 아래 RULE_FIELDS와 따로 그린다.
// 자리 선택과 같은 그림 버튼을 쓴다(팀 1·팀 2는 아예 같은 그림). 글씨가 그림 안에
// 있으므로 라벨은 aria-label로만 싣는다.
const FIRST_TEAM_OPTIONS: { value: GameSettings['firstTeam']; label: string; img: string }[] = [
  { value: 'A', label: '팀 1', img: LOBBY_ASSETS.btnTeamA },
  { value: 'B', label: '팀 2', img: LOBBY_ASSETS.btnTeamB },
  { value: 'random', label: '무작위', img: LOBBY_ASSETS.btnRandom },
];

// 라벨이 둘인 이유 — 같은 항목을 두 곳에서 다른 폭으로 그린다.
//   label: 로비 폼(GameRulesFields)의 2열 격자용 축약 이름. 스테이지 박스가 좁아
//          긴 이름을 쓰면 잘리거나 폼에 스크롤바가 생긴다(LOBBY_REDESIGN.md §12).
//   title: 대기실(GameRulesInputs)처럼 폭이 넉넉한 곳에서 쓰는 전체 이름. 로비 폼에서는
//          같은 문자열이 title 속성(툴팁)으로 붙어 축약된 이름의 뜻을 보충한다.
// firstTeam은 SETTINGS_LIMITS에 min/max가 없는 항목이라 키에서 제외한다.
const RULE_FIELDS: {
  key: keyof Omit<GameSettings, 'firstTeam'>;
  label: string;
  title: string;
  suffix: string;
  hint?: string;
}[] = [
  { key: 'targetScore', label: '목표 점수', title: '목표 점수', suffix: '점' },
  { key: 'festivalTurn', label: '축제 시작', title: '도토리 축제 시작 턴', suffix: '턴' },
  { key: 'festivalDrawCount', label: '도토리 뽑기', title: '도토리 뽑기 횟수', suffix: '회' },
  {
    key: 'festivalDrawIncreaseInterval',
    label: '뽑기 증가 주기',
    title: '뽑기 증가 주기 — 이 턴마다 발동 횟수가 늘어난다',
    suffix: '턴',
    hint: '999 = 재발동 없음',
  },
  { key: 'drawTimeSec', label: '뽑기 시간', title: '동물 뽑기 제한시간', suffix: '초' },
  { key: 'actionTimeSec', label: '행동 시간', title: '행동 선택 제한시간', suffix: '초' },
  { key: 'noActionTimeSec', label: '행동 없을 때', title: '행동할 게 없을 때 제한시간', suffix: '초' },
];

/** 입력값을 SETTINGS_LIMITS 범위로 자르는 공통 처리 — 두 입력 폼이 같은 규칙을 쓴다. */
function clampField(key: keyof Omit<GameSettings, 'firstTeam'>, raw: string): number {
  const { min, max } = SETTINGS_LIMITS[key];
  return Math.min(max, Math.max(min, Math.round(Number(raw) || DEFAULT_SETTINGS[key])));
}

/** 방장(방을 만드는 쪽)만 보는 게임 규칙 입력 — 값을 비워두면 기본값 그대로 방을 만든다. */
export function GameRulesFields({
  settings,
  onChange,
}: {
  settings: GameSettings;
  onChange: (next: GameSettings) => void;
}) {
  const [open, setOpen] = useState(false);
  const bodyRef = useRef<HTMLDivElement>(null);

  // 펼치는 순간 규칙을 화면 안으로 끌어온다.
  //
  // 카드는 스테이지가 허락하는 데까지만 자라므로(globals.css의 .lobby-form-board),
  // 접힌 내용이 이미 그 상한에 가까우면 **펼쳐도 규칙이 보이는 영역 밖에 놓인다** —
  // 화면에는 "눌렀는데 아무 일도 없는" 것으로 보인다. 실제로 1440×950에서 카드가
  // 528 → 537px(상한)까지밖에 못 자라 그렇게 됐다.
  //
  // block: 'nearest'라 이미 보이면 아무것도 하지 않고, 넘칠 때만 필요한 만큼 민다.
  useEffect(() => {
    if (!open) return;
    bodyRef.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, [open]);

  return (
    // data-rules-open은 상태를 밖에서 알아볼 표식으로 남겨 둔다 — 예전에는 이 속성을
    // :has()로 읽어 카드를 2열로 넓히거나 확대를 1로 내렸다. 되살릴 때 컴포넌트를
    // 다시 고치지 않아도 된다.
    <div className="lobby-rules border border-board-line rounded-lg" data-rules-open={open || undefined}>
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between px-3 py-2 text-sm font-semibold text-gray-600"
      >
        <span><UiIcon name="iconCog" /> 게임 규칙 (방장이 정해요)</span>
        <span className="text-gray-400">{open ? '접기 ▲' : '펼치기 ▼'}</span>
      </button>
      {open && (
        // 펼쳐지는 몸통은 흐름 안에 그대로 둔다 — 카드는 스테이지가 허락하는 데까지만
        // 자라고(globals.css의 .lobby-form-board max-height) 그보다 길면 안쪽이 스크롤한다.
        // 한때 이 몸통을 절대배치해 카드를 아예 안 자라게 해봤지만, 몸통이 보이는 영역
        // 밖으로 나가 "펼치기를 눌러도 아무 일도 없는" 화면이 됐다(globals.css .lobby-rules 주석).
        <div ref={bodyRef} className="lobby-rules-body px-3 pb-2.5 border-t border-gray-100 pt-2 flex flex-col gap-1.5">
          {/* 선 플레이어 — 숫자 입력이 아니라 3지선다라 격자 위에 한 줄로 둔다 */}
          <div className="flex flex-col gap-0.5">
            <label className="text-xs text-gray-500">선 플레이어 (먼저 시작하는 팀)</label>
            <div className="flex gap-1.5 items-center">
              {FIRST_TEAM_OPTIONS.map(({ value, label, img }) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => onChange({ ...settings, firstTeam: value })}
                  aria-pressed={settings.firstTeam === value}
                  aria-label={label}
                  title={label}
                  className="pick-image-button"
                >
                  <img src={img} alt="" draggable={false} />
                </button>
              ))}
            </div>
          </div>

        {/* 한 항목씩 세로로 — 예전에는 2열로 눌러 담았지만, 규칙을 펼치면 카드가
            넘치는 만큼 스크롤하도록 바뀌어(globals.css의 data-rules-open 절) 더는
            좁은 세로에 억지로 맞출 이유가 없다. 라벨도 잘리지 않는다. */}
        <div className="grid grid-cols-1 gap-y-1.5">
          {RULE_FIELDS.map(({ key, label, title, suffix, hint }) => {
            const { min, max } = SETTINGS_LIMITS[key];
            return (
              <div key={key} className="flex flex-col text-xs" title={title}>
                <div className="flex items-center justify-between gap-1">
                  <label className="text-gray-500 truncate min-w-0">{label}</label>
                  <div className="flex items-center gap-1 shrink-0">
                    <input
                      type="number"
                      min={min}
                      max={max}
                      value={settings[key]}
                      onChange={e => {
                        const v = Number(e.target.value);
                        onChange({ ...settings, [key]: Number.isFinite(v) ? v : DEFAULT_SETTINGS[key] });
                      }}
                      onBlur={e => onChange({ ...settings, [key]: clampField(key, e.target.value) })}
                      className="input-base input-compact input-rule-num"
                    />
                    <span className="text-gray-400 w-3">{suffix}</span>
                  </div>
                </div>
                {hint && <p className="text-[0.6rem] text-gray-400 text-right leading-tight">{hint}</p>}
              </div>
            );
          })}
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * 게임 규칙 입력 묶음(제목 없이 항목만) — 대기실에서 방장이 규칙을 고칠 때 쓴다.
 *
 * 로비 폼의 GameRulesFields와 **일부러 레이아웃이 다르다.** 로비 폼은 배경 위 안전영역
 * 안에 절대배치라 세로로 늘어날 수 없어 2열로 눌러 담아야 하지만, 대기실은 폭도 높이도
 * 여유가 있어 한 항목씩 세로로 두고 전체 이름(title)을 그대로 쓴다.
 */
export function GameRulesInputs({
  settings,
  onChange,
}: {
  settings: GameSettings;
  onChange: (next: GameSettings) => void;
}) {
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-1">
        <label className="text-lg text-board-muted">선 플레이어(먼저 시작하는 팀)</label>
        {/* 폭은 globals.css의 .first-team-row가 정한다 — 버튼을 24%로 묶고 양끝에 붙인다.
            (한때 max-w-md로 줄을 통째로 좁혔는데, 버튼이 116px까지 작아져 되돌렸다) */}
        <div className="first-team-row">
          {/* 로비 폼과 같은 그림 버튼을 쓴다 — 같은 것을 고르는 자리라 모양도 같아야 한다.
              글씨가 그림 안에 있으므로 라벨은 aria-label로만 싣는다. */}
          {FIRST_TEAM_OPTIONS.map(({ value, label, img }) => (
            <button
              key={value}
              type="button"
              onClick={() => onChange({ ...settings, firstTeam: value })}
              aria-pressed={settings.firstTeam === value}
              aria-label={label}
              title={label}
              className="pick-image-button"
            >
              <img src={img} alt="" draggable={false} />
            </button>
          ))}
        </div>
      </div>
      <div className="flex flex-col gap-3">
        {RULE_FIELDS.map(({ key, title, suffix, hint }) => {
          const { min, max } = SETTINGS_LIMITS[key];
          return (
            <div key={key} className="flex flex-col gap-0.5">
              <div className="flex items-center gap-2 text-lg">
                <label className="text-board-muted whitespace-nowrap">{title}</label>
                {/* 라벨과 입력창 사이를 점선으로 이어 어느 값이 어느 항목인지 눈으로 따라가기 쉽게 한다. */}
                <span className="flex-1 min-w-4 border-b-2 border-dotted border-board-line" />
                <input
                  type="number"
                  min={min}
                  max={max}
                  value={settings[key]}
                  onChange={e => {
                    const v = Number(e.target.value);
                    onChange({ ...settings, [key]: Number.isFinite(v) ? v : DEFAULT_SETTINGS[key] });
                  }}
                  onBlur={e => onChange({ ...settings, [key]: clampField(key, e.target.value) })}
                  className="input-base input-rule"
                />
                <span className="text-board-muted w-8 shrink-0">{suffix}</span>
              </div>
              {hint && <p className="text-sm text-board-muted text-right">{hint}</p>}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/** 대기실에 한 줄로 보여주는 규칙 요약 — 참가자도 시작 전에 규칙을 확인할 수 있게. */
export function RuleSummary({
  settings,
  teamNames,
}: {
  settings: GameSettings;
  teamNames: Record<Team, string | null>;
}) {
  const firstTeamLabel =
    settings.firstTeam === 'random'
      ? '무작위 추첨'
      : settings.firstTeam === 'A'
        ? (teamNames.A ?? '팀 1')
        : (teamNames.B ?? '팀 2');

  // 규칙 종류(승패·축제 / 제한시간)끼리 묶어 두 행으로 나눈다 — 한 줄에 흘려두면
  // 화면 폭에 따라 마지막 한 항목만 다음 줄로 넘어가 어정쩡하게 보인다.
  return (
    <div className="board-panel p-4 text-base text-board-muted flex flex-col gap-1.5">
      <div className="flex flex-wrap gap-x-6 gap-y-1.5 justify-center">
        <span>🚩 선공 {firstTeamLabel}</span>
        <span>🎯 목표 {settings.targetScore}점</span>
        <span>🌰 축제 {settings.festivalTurn}턴부터 (뽑기 {settings.festivalDrawCount}회)</span>
      </div>
      <div className="flex flex-wrap gap-x-6 gap-y-1.5 justify-center">
        <span>⏳ 뽑기 {settings.drawTimeSec}초</span>
        <span>⏳ 행동 {settings.actionTimeSec}초</span>
      </div>
    </div>
  );
}
