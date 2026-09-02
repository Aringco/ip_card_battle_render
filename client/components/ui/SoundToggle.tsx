'use client';

import { useEffect, useRef, useState } from 'react';
import {
  getAudioSettings,
  setAudioSettings,
  subscribeAudioSettings,
  type AudioSettings,
} from '@/lib/audioSettings';
import {
  DEFAULT_FONT_STEP,
  FONT_SCALE_STEPS,
  getFontStep,
  setFontStep,
  subscribeUiSettings,
} from '@/lib/uiSettings';

function ToggleButton({
  label,
  active,
  disabled,
  onClick,
}: {
  label: string;
  active: boolean;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`w-[5.25rem] shrink-0 py-1.5 rounded-md text-xs font-semibold text-center transition-colors ${
        active
          ? 'bg-jungle-700 text-white'
          : 'bg-gray-200 text-gray-400 line-through'
      } ${disabled ? 'opacity-60 cursor-not-allowed' : ''}`}
    >
      {label}
    </button>
  );
}

function VolumeRow({
  label,
  active,
  disabled,
  volume,
  onToggle,
  onVolumeChange,
}: {
  label: string;
  active: boolean;
  disabled?: boolean;
  volume: number;
  onToggle: () => void;
  onVolumeChange: (v: number) => void;
}) {
  return (
    <div className="flex items-center gap-2">
      <ToggleButton label={label} active={active} disabled={disabled} onClick={onToggle} />
      <input
        type="range"
        min={0}
        max={100}
        step={5}
        value={Math.round(volume * 100)}
        onChange={e => onVolumeChange(Number(e.target.value) / 100)}
        disabled={disabled || !active}
        className="flex-1 min-w-0 accent-jungle-600 disabled:opacity-40"
      />
      <span className="text-2xs text-gray-400 w-[2.625rem] text-right tabular-nums">
        {Math.round(volume * 100)}
      </span>
    </div>
  );
}

/** 글씨 크기 5단계 — 레이아웃은 그대로 두고 글자 크기만 조절한다. */
function FontSizeRow() {
  const [step, setStep] = useState(DEFAULT_FONT_STEP);

  // 저장된 값은 클라이언트에서만 읽을 수 있으므로(서버 렌더와 어긋나지 않게) 마운트 후 맞춘다.
  useEffect(() => {
    setStep(getFontStep());
    return subscribeUiSettings(() => setStep(getFontStep()));
  }, []);

  return (
    <div className="flex items-center gap-2">
      <span className="w-[5.25rem] shrink-0 py-1.5 rounded-md bg-jungle-700 text-white text-xs font-semibold text-center">
        글씨
      </span>
      <div className="flex-1 min-w-0 flex items-center justify-between gap-0.5">
        {FONT_SCALE_STEPS.map((_, i) => {
          const value = i + 1;
          const active = value === step;
          return (
            <button
              key={value}
              onClick={() => setFontStep(value)}
              aria-label={`글씨 크기 ${value}단계`}
              aria-pressed={active}
              className={`w-[1.875rem] h-8 rounded-md font-semibold leading-none transition-colors ${
                active ? 'bg-jungle-600 text-white' : 'bg-gray-200 text-gray-500 hover:bg-gray-300'
              }`}
              // 단계별 크기를 버튼 자체로 미리 보여준다(버튼 칸 크기는 고정).
              style={{ fontSize: `${0.6 + i * 0.085}rem` }}
            >
              가
            </button>
          );
        })}
      </div>
      <span className="text-2xs text-gray-400 w-[2.625rem] text-right tabular-nums">
        {step}
      </span>
    </div>
  );
}

export function SoundToggle() {
  const [settings, setSettings] = useState<AudioSettings>(getAudioSettings());
  // 평소엔 작은 원형 스피커 아이콘만 떠 있다가, 누르면 조절 패널로 펼쳐진다.
  // 패널이 펼쳐진 동안 그 바깥을 한 번이라도 클릭하면 다시 원형 아이콘으로 접힌다.
  const [expanded, setExpanded] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => subscribeAudioSettings(() => setSettings(getAudioSettings())), []);

  useEffect(() => {
    if (!expanded) return;
    const handlePointerDown = (e: PointerEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        setExpanded(false);
      }
    };
    document.addEventListener('pointerdown', handlePointerDown);
    return () => document.removeEventListener('pointerdown', handlePointerDown);
  }, [expanded]);

  if (!expanded) {
    return (
      <button
        onClick={() => setExpanded(true)}
        className="fixed bottom-3 right-3 z-[90] w-10 h-10 rounded-full bg-white/90 backdrop-blur shadow-lg border border-jungle-200 flex items-center justify-center text-lg hover:scale-105 transition-transform"
        aria-label="설정 열기"
      >
        ⚙️
        {/* 톱니바퀴만 있으면 음소거 상태가 안 보이므로 꺼져 있을 때만 작게 겹쳐 표시한다. */}
        {settings.muteAll && (
          <span className="absolute -top-0.5 -right-0.5 text-xs leading-none">🔇</span>
        )}
      </button>
    );
  }

  // 개별 버튼의 on/off 표시는 "전체"가 꺼져 있으면 실제로 소리가 안 나는 상태를
  // 그대로 반영해야 한다 — 안 그러면 전체를 꺼도 나머지 버튼은 계속 켜진 것처럼
  // 보여서 "안 꺼졌다"고 오해하게 된다. 전체가 꺼진 동안은 개별 토글/슬라이더도 잠가둔다.
  return (
    <div
      ref={panelRef}
      className="fixed bottom-3 right-3 z-[90] flex flex-col gap-2 bg-white/90 backdrop-blur px-[1.125rem] py-3.5 rounded-2xl shadow-lg border border-jungle-200"
    >
      <button
        onClick={() => setExpanded(false)}
        className="flex items-center gap-1.5 mb-0.5"
        aria-label="설정 접기"
      >
        <span className="text-sm">{settings.muteAll ? '🔇' : '🔊'}</span>
        <span className="text-2xs font-semibold text-gray-400">설정</span>
      </button>
      <VolumeRow
        label="전체"
        active={!settings.muteAll}
        volume={settings.volumeAll}
        onToggle={() => setAudioSettings({ muteAll: !settings.muteAll })}
        onVolumeChange={v => setAudioSettings({ volumeAll: v })}
      />
      <VolumeRow
        label="효과음"
        active={!settings.muteAll && !settings.muteSfx}
        disabled={settings.muteAll}
        volume={settings.volumeSfx}
        onToggle={() => setAudioSettings({ muteSfx: !settings.muteSfx })}
        onVolumeChange={v => setAudioSettings({ volumeSfx: v })}
      />
      <VolumeRow
        label="BGM"
        active={!settings.muteAll && !settings.muteBgm}
        disabled={settings.muteAll}
        volume={settings.volumeBgm}
        onToggle={() => setAudioSettings({ muteBgm: !settings.muteBgm })}
        onVolumeChange={v => setAudioSettings({ volumeBgm: v })}
      />
      <div className="h-px bg-jungle-100 my-0.5" />
      <FontSizeRow />
    </div>
  );
}
