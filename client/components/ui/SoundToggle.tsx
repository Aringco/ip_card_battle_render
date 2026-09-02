'use client';

import { useEffect, useRef, useState } from 'react';
import {
  getAudioSettings,
  setAudioSettings,
  subscribeAudioSettings,
  type AudioSettings,
} from '@/lib/audioSettings';

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
      className={`w-14 shrink-0 py-1 rounded-md text-xs font-semibold text-center transition-colors ${
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
        className="w-20 accent-jungle-600 disabled:opacity-40"
      />
      <span className="text-[0.65rem] text-gray-400 w-7 text-right tabular-nums">
        {Math.round(volume * 100)}
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
        aria-label="사운드 설정 열기"
      >
        {settings.muteAll ? '🔇' : '🔊'}
      </button>
    );
  }

  // 개별 버튼의 on/off 표시는 "전체"가 꺼져 있으면 실제로 소리가 안 나는 상태를
  // 그대로 반영해야 한다 — 안 그러면 전체를 꺼도 나머지 버튼은 계속 켜진 것처럼
  // 보여서 "안 꺼졌다"고 오해하게 된다. 전체가 꺼진 동안은 개별 토글/슬라이더도 잠가둔다.
  return (
    <div
      ref={panelRef}
      className="fixed bottom-3 right-3 z-[90] flex flex-col gap-1.5 bg-white/90 backdrop-blur px-3 py-2.5 rounded-2xl shadow-lg border border-jungle-200"
    >
      <button
        onClick={() => setExpanded(false)}
        className="flex items-center gap-1.5 mb-0.5"
        aria-label="사운드 설정 접기"
      >
        <span className="text-sm">{settings.muteAll ? '🔇' : '🔊'}</span>
        <span className="text-[0.65rem] font-semibold text-gray-400">사운드</span>
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
    </div>
  );
}
