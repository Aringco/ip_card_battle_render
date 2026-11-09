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
import { useGuideEnabled, setGuideEnabled } from '@/lib/guideSettings';
import { IconButton } from '@/components/ui/UiIcon';
import {
  chromeIntentUrl,
  enterFullscreen,
  exitFullscreen,
  fullscreenSupported,
  inAppBrowserName,
  isAndroid,
  isIosPhone,
  lockLandscape,
  useIsFullscreen,
} from '@/lib/fullscreen';

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

/** iOS 스타일 ON/OFF 스위치 — 텍스트 버튼(ToggleButton)과 달리 손잡이가 좌우로
    미끄러지는 슬라이더 모양이라, 눌러야 하는 대상이 "글자"가 아니라 "스위치"임이
    한눈에 보인다. */
function Switch({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: () => void;
  label: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={onChange}
      className={`relative w-11 h-6 shrink-0 rounded-full transition-colors ${
        checked ? 'bg-jungle-600' : 'bg-gray-300'
      }`}
    >
      <span
        className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform ${
          checked ? 'translate-x-5' : 'translate-x-0'
        }`}
      />
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

/** 내 턴마다 뜨는 장소·행동 손가락 가이드 on/off — 게임을 오래 한 사람은 거슬릴 수 있어 끌 수 있게 했다.
    "가이드"라는 글자 자체를 눌러야 하는 ToggleButton 대신, 켜짐/꺼짐이 한눈에 보이는
    슬라이더 스위치를 쓴다(FontSizeRow의 "글씨"처럼 라벨은 누르는 대상이 아니다). */
function GuideToggleRow() {
  const guideEnabled = useGuideEnabled();
  return (
    <div className="flex items-center gap-2">
      <span className="w-[5.25rem] shrink-0 py-1.5 rounded-md bg-jungle-700 text-white text-xs font-semibold text-center">
        가이드
      </span>
      <span className="text-2xs text-gray-400 flex-1">내 턴마다 손가락 안내를 보여줘요</span>
      <Switch checked={guideEnabled} onChange={() => setGuideEnabled(!guideEnabled)} label="턴 가이드 표시 켜기/끄기" />
    </div>
  );
}

/**
 * 전체화면 버튼 — 첫 터치 때 저절로 들어갔다가 사용자가 빠져나온 뒤(뒤로가기 · 쓸어올리기) **다시 켜는 곳**이다.
 * 이 버튼으로 켜면 화면을 **가로로 돌려 고정**한다(안드로이드만 — lockLandscape). 첫 터치 자동 전체화면은 돌리지 않는다
 * (아무 데나 처음 누른 순간 화면이 돌면 놀란다).
 * 패널 맨 위에 크게, **언제나** 둔다(2026-11-01 요청). ⚠️ "홈 화면 앱이면 숨김"을 되살리지 말 것 — 전체화면 API로
 * 들어간 순간 브라우저가 `(display-mode: fullscreen)`도 참으로 돌려, 가로로 돌자마자 버튼이 사라졌다. 홈 화면 앱에서도
 * 이 버튼의 가로 고정은 쓸모가 있다.
 * 전체화면이 안 되는 곳(아이폰 · 앱 안 브라우저가 거절)에서는 누르면 대안을 보여 준다.
 */
function FullscreenRow() {
  const on = useIsFullscreen();
  const [failed, setFailed] = useState(false);

  const toggle = async () => {
    if (on) {
      await exitFullscreen();
      return;
    }
    const ok = fullscreenSupported() && (await enterFullscreen());
    setFailed(!ok);
    // 전체화면이 되면 가로로 돌린다(플레이 화면이 가로) — 안 되는 기기(아이폰 등)는 조용히 넘어간다
    if (ok) void lockLandscape();
  };

  const inApp = inAppBrowserName();
  return (
    <div className="flex flex-col gap-1.5">
      <button
        type="button"
        onClick={() => void toggle()}
        aria-pressed={on}
        className={`w-full py-2 rounded-md text-xs font-bold transition-colors ${
          on ? 'bg-gray-200 text-gray-600' : 'bg-jungle-600 text-white'
        }`}
      >
        {on ? '⤡ 전체화면 끄기' : '⛶ 전체화면 + 가로 보기'}
      </button>
      {failed && !on && (
        <p className="text-2xs leading-snug text-gray-500">
          {isIosPhone() ? (
            <>
              아이폰은 전체화면을 지원하지 않아요. 사파리 <b>공유 → 홈 화면에 추가</b>로 열면 바 없이 즐길 수 있어요.
            </>
          ) : inApp ? (
            <>
              {inApp} 안에서는 전체화면이 막혀 있어요.{' '}
              {isAndroid() ? (
                <a href={chromeIntentUrl()} className="font-bold text-jungle-700 underline">
                  크롬으로 열기
                </a>
              ) : (
                '브라우저에서 열어 주세요.'
              )}
            </>
          ) : (
            <>이 브라우저는 전체화면을 허락하지 않아요. 메뉴의 <b>홈 화면에 추가</b>로 열어 보세요.</>
          )}
        </p>
      )}
    </div>
  );
}

/**
 * 설정 버튼(톱니바퀴)의 한 변(px).
 *
 * 예전 흰 원판은 `w-10 h-10`이었는데, 이 프로젝트는 `html { font-size: 80% }`이라
 * 그 2.5rem은 40px가 아니라 **32px**로 그려졌다. 그 1.3배가 42px다 — 클래스 이름이
 * 아니라 실제로 그려지던 크기를 기준으로 잡았다.
 */
/* ⚠️ 44 아래로 내리지 말 것 — 손가락으로 누르는 대상의 하한이다(Apple HIG 44pt).
   42px였을 때 모바일 실측(measureMobile.mjs)에서 "작은 버튼"으로 잡혔다. */
const COG_BUTTON_PX = 44;

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

  // 흰 원판·테두리·그림자 상자를 걷어내고 톱니바퀴 그림 자체를 버튼으로 쓴다.
  // 배경이 없어진 만큼 누를 수 있는 면적도 줄어드므로 그림을 키운다.
  if (!expanded) {
    return (
      <IconButton
        name="iconCog"
        label="설정 열기"
        size={COG_BUTTON_PX}
        onClick={() => setExpanded(true)}
        // `settings-fab`은 **표식일 뿐** 자리를 정하지 않는다 — 기본은 화면 오른쪽
        // 아래(로비·결과), 플레이 화면에서만 액자의 오른쪽 나무 기둥으로 옮긴다
        // (globals.css의 `.play-bg:has(...)` 규칙). 전역 컴포넌트라 여기서 좌표를
        // 바꾸면 세 화면이 모두 따라 움직인다.
        // 층 99 — 멈춤 메뉴 막(.pause-dim 95 · 요청 창 97 · 안내 98)보다 위라 멈춘 동안에도 누를 수 있다(펼친 판도 같다).
        className="settings-fab fixed bottom-3 right-3 z-[99]"
      >
        {/* 톱니바퀴만 있으면 음소거 상태가 안 보이므로 꺼져 있을 때만 작게 겹쳐 표시한다. */}
        {settings.muteAll && (
          <span className="absolute -top-0.5 -right-0.5 text-xs leading-none drop-shadow">🔇</span>
        )}
      </IconButton>
    );
  }

  // 개별 버튼의 on/off 표시는 "전체"가 꺼져 있으면 실제로 소리가 안 나는 상태를
  // 그대로 반영해야 한다 — 안 그러면 전체를 꺼도 나머지 버튼은 계속 켜진 것처럼
  // 보여서 "안 꺼졌다"고 오해하게 된다. 전체가 꺼진 동안은 개별 토글/슬라이더도 잠가둔다.
  return (
    // ⚠️ 판은 오른쪽 아래에 붙어 위로 자란다 — 가로로 눕힌 폰(높이 ~390px)에서는 판이 화면보다 커져 맨 위의 [전체화면]이
    //    화면 밖으로 밀려났다. 그래서 판의 높이를 보이는 높이로 자르고(globals.css의 .settings-fab-panel), 머리줄 ·
    //    [전체화면]은 고정한 채 아래 항목만 판 안에서 스크롤한다.
    <div
      ref={panelRef}
      className="settings-fab-panel fixed bottom-3 right-3 z-[99] flex flex-col gap-2 bg-white/90 backdrop-blur px-[1.125rem] py-3.5 rounded-2xl shadow-lg border border-jungle-200"
    >
      <button
        onClick={() => setExpanded(false)}
        className="flex items-center gap-1.5 mb-0.5"
        aria-label="설정 접기"
      >
        <span className="text-sm">{settings.muteAll ? '🔇' : '🔊'}</span>
        <span className="text-2xs font-semibold text-gray-400">설정</span>
      </button>
      <FullscreenRow />
      <div className="settings-fab-scroll flex flex-col gap-2 min-h-0 overflow-y-auto">
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
      <GuideToggleRow />
      </div>
    </div>
  );
}
