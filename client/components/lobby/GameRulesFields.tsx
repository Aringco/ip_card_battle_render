'use client';

import { useState } from 'react';
import type { GameSettings, Team } from 'shared';
import { DEFAULT_SETTINGS, SETTINGS_LIMITS } from 'shared';

// 선 플레이어(먼저 시작하는 팀) — 숫자가 아니라 3지선다라 아래 RULE_FIELDS와 따로 그린다.
const FIRST_TEAM_OPTIONS: { value: GameSettings['firstTeam']; label: string }[] = [
  { value: 'A', label: '🟢 팀 1' },
  { value: 'B', label: '🔵 팀 2' },
  { value: 'random', label: '🎲 무작위' },
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

  return (
    <div className="border border-gray-200 rounded-lg">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between px-3 py-2 text-sm font-semibold text-gray-600"
      >
        <span>⚙️ 게임 규칙 (방장이 정해요)</span>
        <span className="text-gray-400">{open ? '접기 ▲' : '펼치기 ▼'}</span>
      </button>
      {open && (
        // 행을 조밀하게 잡아 5개 항목이 스테이지 박스 안에 전부 들어오게 한다.
        // max-height는 안전망일 뿐이라 평소에는 스크롤도, 행이 반쯤 잘리는 일도 없다.
        <div className="px-3 pb-2.5 border-t border-gray-100 pt-2 flex flex-col gap-1.5">
          {/* 선 플레이어 — 숫자 입력이 아니라 3지선다라 격자 위에 한 줄로 둔다 */}
          <div className="flex flex-col gap-0.5">
            <label className="text-xs text-gray-500">선 플레이어 (먼저 시작하는 팀)</label>
            <div className="flex gap-1">
              {FIRST_TEAM_OPTIONS.map(({ value, label }) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => onChange({ ...settings, firstTeam: value })}
                  className={`flex-1 py-1 rounded-lg font-semibold transition text-xs ${
                    settings.firstTeam === value
                      ? 'bg-jungle-600 text-white'
                      : 'bg-gray-100 text-gray-600 hover:bg-gray-200 ring-1 ring-gray-300'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

        <div className="grid grid-cols-2 gap-x-3 gap-y-1.5">
          {RULE_FIELDS.map(({ key, label, title, suffix, hint }) => {
            const { min, max } = SETTINGS_LIMITS[key];
            return (
              <div key={key} className="flex flex-col text-xs" title={title}>
                <div className="flex items-center justify-between gap-1">
                  <label className="text-gray-500 truncate">{label}</label>
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
                      className="input-base input-compact w-16 text-right"
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
        <label className="text-lg text-gray-500">선 플레이어(먼저 시작하는 팀)</label>
        <div className="flex gap-1">
          {FIRST_TEAM_OPTIONS.map(({ value, label }) => (
            <button
              key={value}
              type="button"
              onClick={() => onChange({ ...settings, firstTeam: value })}
              className={`flex-1 py-2 rounded-lg font-semibold transition text-base ${
                settings.firstTeam === value
                  ? 'bg-green-600 text-white'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              {label}
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
                <label className="text-gray-500 whitespace-nowrap">{title}</label>
                {/* 라벨과 입력창 사이를 점선으로 이어 어느 값이 어느 항목인지 눈으로 따라가기 쉽게 한다. */}
                <span className="flex-1 min-w-4 border-b-2 border-dotted border-gray-300" />
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
                <span className="text-gray-400 w-8 shrink-0">{suffix}</span>
              </div>
              {hint && <p className="text-sm text-gray-400 text-right">{hint}</p>}
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
    <div className="bg-gray-50 rounded-xl p-4 text-base text-gray-500 flex flex-col gap-1.5">
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
