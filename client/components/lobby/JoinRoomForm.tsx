'use client';

import type { Team } from 'shared';
import { Field, FormCard } from './Field';
import { TeamSelect } from './TeamSelect';

export function JoinRoomForm({
  firstFieldRef,
  nickname,
  onNickname,
  roomCode,
  onRoomCode,
  team,
  onTeam,
  canSubmit,
  onSubmit,
}: {
  firstFieldRef?: React.Ref<HTMLInputElement>;
  nickname: string;
  onNickname: (v: string) => void;
  roomCode: string;
  onRoomCode: (v: string) => void;
  team: Team;
  onTeam: (t: Team) => void;
  canSubmit: boolean;
  onSubmit: () => void;
}) {
  return (
    <FormCard title="🔑 방 참가하기" description="친구가 알려준 4자리 코드로 입장해요.">
      <Field label="닉네임">
        <input
          ref={firstFieldRef}
          type="text"
          value={nickname}
          onChange={e => onNickname(e.target.value)}
          placeholder="닉네임 입력"
          maxLength={12}
          className="input-base"
        />
      </Field>

      <Field label="방 코드">
        <input
          type="text"
          value={roomCode}
          onChange={e => onRoomCode(e.target.value.toUpperCase())}
          placeholder="예: ABCD"
          maxLength={4}
          className="input-base font-mono tracking-widest"
        />
      </Field>

      <TeamSelect team={team} onChange={onTeam} />

      <button
        onClick={onSubmit}
        disabled={!canSubmit}
        className="bg-jungle-600 hover:bg-jungle-700 disabled:bg-gray-300 text-white font-semibold py-3 rounded-xl transition"
      >
        입장하기
      </button>
    </FormCard>
  );
}
