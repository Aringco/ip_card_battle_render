import type { SideId } from 'shared';

export function PlayerList({
  team,
  members,
  activePlayerIndex,
  isActiveTeam,
}: {
  team: SideId;
  members: string[];
  activePlayerIndex: number;
  isActiveTeam: boolean;
}) {
  return (
    <div className="flex flex-col gap-1">
      {members.map((name, i) => {
        const isActive = isActiveTeam && i === activePlayerIndex;
        return (
          <div
            key={name}
            data-player-anchor={`${team}:${i}`}
            // 글자·안여백은 `.play-team-member`(globals.css)가 무대 크기를 따라 정한다 —
            // 고정 크기로 두면 좁은 칸에서 이 줄이 경험치 네 줄을 밀어낸다.
            className={`play-team-member rounded-full truncate transition-all ${
              isActive
                ? 'glow-pulse bg-jungle-700 text-white font-bold'
                : 'bg-jungle-50 text-jungle-800'
            }`}
          >
            {isActive && <span className="mr-1">▶</span>}
            {name}
          </div>
        );
      })}
    </div>
  );
}
