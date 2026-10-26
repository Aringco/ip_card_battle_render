import type { GameSettings } from 'shared';

/**
 * 이벤트 모드에서 페이지를 건너 기억해야 하는 것(EVENT_MODE_ROADMAP.md §2.2).
 *
 * 로비 → 게임 화면 → 로비로 오갈 때마다 페이지가 새로 마운트되므로 상태가 남지 않는다. 그래서
 * - 개발자: 표시 이름·운영 암호·devId·게임 규칙 — 판이 끝나 로비로 돌아오면 **저절로 다시 대기**한다(상시 대기).
 *   규칙은 서버도 devId별로 기억하지만, 서버가 다시 켜지면(devId를 모른다) 여기 둔 규칙으로 다시 세운다.
 * - 도전자: 마지막 닉네임과 "이벤트에서 돌아왔다"는 한 번짜리 표식 — 로비가 이벤트 폼을 연 채로 시작한다.
 *
 * sessionStorage인 이유는 다른 세션 값(방·플레이어 id)과 같다 — 탭마다 따로라 한 브라우저로 두 탭을 열어
 * 개발자·도전자를 함께 시험해도 서로 덮어쓰지 않는다. ⚠️ 운영 암호가 이 탭에 남으므로 부스 기기를 행사 뒤에
 * 그대로 두지 말 것(탭을 닫으면 사라진다).
 */

const KEY_DEV = 'cardBattle_eventDev';
const KEY_NAME = 'cardBattle_eventName';
const KEY_RETURN = 'cardBattle_eventReturn';

export interface EventDevSession {
  name: string;
  token: string;
  devId?: string;
  settings?: Partial<GameSettings>;
}

function store(): Storage | null {
  return typeof window === 'undefined' ? null : window.sessionStorage;
}

export function loadDevSession(): EventDevSession | null {
  try {
    const raw = store()?.getItem(KEY_DEV);
    return raw ? (JSON.parse(raw) as EventDevSession) : null;
  } catch {
    return null;
  }
}

export function saveDevSession(s: EventDevSession): void {
  store()?.setItem(KEY_DEV, JSON.stringify(s));
}

export function clearDevSession(): void {
  store()?.removeItem(KEY_DEV);
}

export function loadEventName(): string {
  return store()?.getItem(KEY_NAME) ?? '';
}

export function saveEventName(name: string): void {
  store()?.setItem(KEY_NAME, name);
}

/** 결과 화면에서 [이벤트로 돌아가기]를 눌렀다 — 로비가 도전자 폼을 연 채로 시작한다. */
export function markEventReturn(): void {
  store()?.setItem(KEY_RETURN, 'challenger');
}

/** 한 번만 읽고 지운다. */
export function takeEventReturn(): boolean {
  const s = store();
  if (!s) return false;
  const v = s.getItem(KEY_RETURN);
  s.removeItem(KEY_RETURN);
  return v === 'challenger';
}
