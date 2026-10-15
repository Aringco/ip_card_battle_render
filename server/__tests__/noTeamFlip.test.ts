import fs from 'fs';
import path from 'path';

// 개인전 일반화의 그물 — "반대편 뒤집기"(team === 'A' ? 'B' : 'A')가 새로 생기면 실패한다.
//
// 팀전은 편이 둘이라 이 식이 정확히 "상대"를 가리켰지만, 개인전(편 p1…p8)에서는 조용히 없는 편 'B'를
// 가리킨다. 그런데 Team을 SideId(string)로 넓힌 뒤에는 이 식이 **컴파일러에 걸리지 않는다** —
// 그래서 이 테스트가 유일한 방어선이다. 상대는 shared/sides.ts의 opponentsOf로 구한다.
//
// 아래 허용 목록은 "정말 팀전에서만 도는 코드"다. 새 항목을 더하기 전에, 개인전에서 그 줄에
// 도달할 수 있는지 먼저 확인할 것.

const ROOT = path.resolve(__dirname, '..', '..');
const SCAN_DIRS = ['server', 'shared', 'client/hooks', 'client/components', 'client/lib', 'client/app'];
const FLIP = /=== '[AB]' \? '[AB]' : '[AB]'/;

/** [파일(루트 기준), 그 줄에 들어 있어야 하는 문자열, 허용 이유] */
const ALLOWED: Array<[string, string, string]> = [
  ['server/room.ts', 'const opponent: Team = team === ', '혼자 놀기 컴퓨터(pickComputerSkill)는 팀전 전용'],
  ['server/room.ts', "const other = this.teamNames[team === 'A'", '대기실 팀 이름 중복 검사 — 팀전 전용'],
  ['server/room.ts', "this.assignTeamName(own === 'A'", '방장이 정하는 상대 팀 이름 — 팀전 전용'],
  ['server/demo/director.ts', 'const idle: Team = ', '시연 3장은 팀전 대본'],
  ['server/scripts/balanceAnalysis.ts', 'const opponent: Team = ', '팀전 봇 분석 스크립트'],
  ['server/scripts/balanceAnalysis.ts', 'const loser: Team = ', '팀전 봇 분석 스크립트'],
  ['server/scripts/skillBalanceSuite.ts', 'const opponent: Team = ', '팀전 봇 분석 스크립트'],
  ['client/hooks/useAnimationQueue.ts', "const loser: SideId = winner === 'A'", '결정타 연출(gameEnd knockout)은 팀전 경로 — 개인전의 gameEnd는 reason이 ranked'],
  ['client/components/lobby/WaitingRoom.tsx', "otherName={teamNames[team === 'A'", '대기실 팀 이름 — 팀전 전용'],
  // ⚠️ 아래 둘은 T3-2(개인전 방)에서 없어져야 한다 — 허용 목록에서도 함께 지울 것.
  ['server/room.ts', 'const opponent: Team = p.team', '일시정지를 물을 상대 팀 — T3-2에서 opponentsOf로 바꾼다'],
  ['server/room.ts', 'const winner: Team = p.team', '항복한 팀의 상대 = 승자 — T3-2에서 개인전 처리를 더한다'],
];

function walk(dir: string, out: string[] = []): string[] {
  for (const name of fs.readdirSync(dir)) {
    if (name === 'node_modules' || name === 'dist' || name === '.next' || name === 'backups' || name === '__tests__') continue;
    const full = path.join(dir, name);
    const st = fs.statSync(full);
    if (st.isDirectory()) walk(full, out);
    else if (/\.(ts|tsx)$/.test(name)) out.push(full);
  }
  return out;
}

describe('반대편 뒤집기 재발 방지', () => {
  const hits: Array<{ file: string; line: string }> = [];
  for (const d of SCAN_DIRS) {
    const dir = path.join(ROOT, d);
    if (!fs.existsSync(dir)) continue;
    for (const f of walk(dir)) {
      const rel = path.relative(ROOT, f).split(path.sep).join('/');
      for (const line of fs.readFileSync(f, 'utf8').split(/\r?\n/)) {
        const t = line.trim();
        if (t.startsWith('//') || t.startsWith('*') || t.startsWith('/*')) continue; // 주석은 설명일 뿐이다
        if (FLIP.test(line)) hits.push({ file: rel, line: t });
      }
    }
  }

  it('허용 목록 밖에는 뒤집기가 없다', () => {
    const stray = hits.filter(h => !ALLOWED.some(([file, snippet]) => file === h.file && h.line.includes(snippet)));
    expect(stray).toEqual([]);
  });

  it('허용 목록의 항목은 모두 실제로 남아 있다(지워진 코드의 항목은 같이 지운다)', () => {
    const stale = ALLOWED.filter(([file, snippet]) => !hits.some(h => h.file === file && h.line.includes(snippet)));
    expect(stale.map(([file, snippet]) => `${file}: ${snippet}`)).toEqual([]);
  });
});
