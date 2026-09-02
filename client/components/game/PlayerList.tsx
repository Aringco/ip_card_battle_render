import type { Team } from 'shared';

export function PlayerList({
  team,
  members,
  activePlayerIndex,
  isActiveTeam,
}: {
  team: Team;
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
            className={`text-xs px-3 py-1 rounded-full truncate transition-all ${
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
