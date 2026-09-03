'use client';

import { useState } from 'react';
import type { GameSettings, Team } from 'shared';
import { DEFAULT_SETTINGS, SETTINGS_LIMITS } from 'shared';

const FIRST_TEAM_OPTIONS: { value: GameSettings['firstTeam']; label: string }[] = [
  { value: 'A', label: '🟢 팀 1 먼저' },
  { value: 'B', label: '🔵 팀 2 먼저' },
  { value: 'random', label: '🎲 무작위' },
];

const RULE_FIELDS: {
  key: keyof Omit<GameSettings, 'firstTeam'>;
  label: string;
  suffix: string;
  hint?: string;
}[] = [
  { key: 'targetScore', label: '목표 점수', suffix: '점' },
  { key: 'festivalTurn', label: '도토리 축제 시작 턴', suffix: '턴' },
  { key: 'festivalDrawCount', label: '도토리 뽑기 횟수', suffix: '회' },
  { key: 'festivalDrawIncreaseInterval', label: '뽑기 증가 주기', suffix: '턴', hint: '999 = 재발동 없음' },
  { key: 'drawTimeSec', label: '동물 뽑기 제한시간', suffix: '초' },
  { key: 'actionTimeSec', label: '행동 선택 제한시간', suffix: '초' },
  { key: 'noActionTimeSec', label: '행동할 게 없을 때 제한시간', suffix: '초' },
];

/** 게임 규칙 입력 묶음(제목 없이 항목만) — 방 생성 화면과 대기실 양쪽에서 재사용한다. */
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
        {RULE_FIELDS.map(({ key, label, suffix, hint }) => {
          const { min, max } = SETTINGS_LIMITS[key];
          return (
            <div key={key} className="flex flex-col gap-0.5">
              <div className="flex items-center gap-2 text-lg">
                <label className="text-gray-500 whitespace-nowrap">{label}</label>
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
                  onBlur={e => {
                    const v = Math.min(max, Math.max(min, Math.round(Number(e.target.value) || DEFAULT_SETTINGS[key])));
                    onChange({ ...settings, [key]: v });
                  }}
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

// 방장(방을 만드는 쪽)만 보는 게임 규칙 입력 — 값을 비워두면 기본값 그대로 방을 만든다.
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
        className="w-full flex items-center justify-between px-4 py-3 text-lg font-semibold text-gray-600"
      >
        <span>⚙️ 게임 규칙 (방장이 정해요)</span>
        <span className="text-gray-400">{open ? '접기 ▲' : '펼치기 ▼'}</span>
      </button>
      {open && (
        <div className="px-4 pb-4 border-t border-gray-100 pt-3">
          <GameRulesInputs settings={settings} onChange={onChange} />
        </div>
      )}
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
