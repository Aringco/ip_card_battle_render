/**
 * 시연회 분기 — 혼자 놀기에서 이 이름 짝으로 들어오면 켜진다.
 *
 * ⚠️ **이 파일은 `server/` 안에만 있어야 한다.** `shared/`에 두면 클라이언트 번들에
 *    이 문자열이 그대로 박혀, 화면 소스를 뒤지는 누구나 찾아낼 수 있다. 시연 여부는
 *    서버가 판정해 `ClientGameState.demo`로만 내보낸다(암호 자체는 나가지 않는다).
 *
 * 설계 배경과 시연 시나리오 전체는 저장소 루트의 `DEMO_MODE.md`에 있다.
 */
const DEMO_TEAM_NAME = '키피전자오락센타';
const DEMO_NICKNAME = '시연자';

/**
 * 이 혼자 놀기 요청이 시연회용인지.
 *
 * ⚠️ **둘 다 맞아야 한다.** 닉네임만 맞아도 켜지게 두면 우연히 "시연자"라는 이름을
 *    쓴 사람이 영문 모를 판을 하게 된다.
 * ⚠️ 앞뒤 공백은 걷어내고 비교한다 — 진행자가 복사·붙여넣기로 입력할 때 공백이
 *    섞여 들어오는 일이 잦고, 그때 "분명 맞게 썼는데 안 켜진다"가 된다.
 *    다만 가운데 공백이나 다른 글자는 허용하지 않는다(정확히 그 이름이어야 한다).
 *
 * ⚠️ 이름 길이 제한(12자)은 신경 쓰지 않아도 된다 — 팀명 8자, 닉네임 3자로 둘 다
 *    제한 안이라 `normalizeNickname`·`assignTeamName`을 그대로 통과한다. 그래서
 *    시연 중에도 화면에는 진행자가 입력한 이름이 그대로 뜬다.
 */
export function isDemoRequest(nickname: string, teamName?: string): boolean {
  return nickname.trim() === DEMO_NICKNAME && (teamName ?? '').trim() === DEMO_TEAM_NAME;
}
