'use client';

import { useState } from 'react';
import type { GameSettings } from 'shared';
import { DEFAULT_SETTINGS, SETTINGS_LIMITS } from 'shared';

// 선 플레이어(먼저 시작하는 팀) — 숫자가 아니라 3지선다라 아래 RULE_FIELDS와 따로 그린다.
const FIRST_TEAM_OPTIONS: { value: GameSettings['firstTeam']; label: string }[] = [
  { value: 'A', label: '🟢 팀 1' },
  { value: 'B', label: '🔵 팀 2' },
  { value: 'random', label: '🎲 무작위' },
];

// 2열로 배치하므로 라벨은 짧게 — 전체 설명은 title 속성으로 남겨 둔다.
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
                      onBlur={e => {
                        const v = Math.min(max, Math.max(min, Math.round(Number(e.target.value) || DEFAULT_SETTINGS[key])));
                        onChange({ ...settings, [key]: v });
                      }}
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
