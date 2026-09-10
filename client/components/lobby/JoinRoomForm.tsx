'use client';

import type { Seat } from 'shared';
import { Field, FormCard } from './Field';
import { NicknameField } from './NameFields';
import { TeamSelect } from './TeamSelect';
import { PlankButton } from '@/components/ui/PlankButton';

export function JoinRoomForm({
  firstFieldRef,
  nickname,
  onNickname,
  nicknameHint,
  roomCode,
  onRoomCode,
  arrivedByInvite,
  team,
  onTeam,
  spectatorSeat,
  canSubmit,
  onSubmit,
}: {
  firstFieldRef?: React.Ref<HTMLInputElement>;
  nickname: string;
  onNickname: (v: string) => void;
  nicknameHint: string;
  roomCode: string;
  onRoomCode: (v: string) => void;
  /** 초대 링크(`/?room=ABCD`)로 들어왔는지 — 방 코드가 이미 채워져 있음을 알린다 */
  arrivedByInvite: boolean;
  team: Seat;
  onTeam: (t: Seat) => void;
  /** 관전석을 골랐는지 — 안내문이 한 줄 붙는다 */
  spectatorSeat: boolean;
  canSubmit: boolean;
  onSubmit: () => void;
}) {
  return (
    <FormCard
      title="🔑 방 참가하기"
      description={
        // 관전자 안내를 새 줄로 붙이지 않고 이 줄을 갈아끼운다 — TeamSelect 주석 참고
        spectatorSeat ? "관전자는 지켜보기만 해요." : "친구가 알려준 4자리 코드로 입장해요."
      }
    >
      {arrivedByInvite && (
        <p className="-mt-1 text-[0.7rem] leading-tight text-jungle-700 bg-jungle-50
                      border border-jungle-200 rounded-lg px-2 py-1.5">
          초대 링크로 들어왔어요. 방 코드는 이미 채워뒀으니 닉네임과 팀만 정하면 됩니다.
        </p>
      )}

      <NicknameField
        inputRef={firstFieldRef}
        nickname={nickname}
        onChange={onNickname}
        hint={nicknameHint}
      />

      <Field label="방 코드">
        <input
          type="text"
          value={roomCode}
          onChange={e => onRoomCode(e.target.value.toUpperCase())}
          placeholder="예: ABCD"
          maxLength={4}
          className="input-base tracking-widest"
        />
      </Field>

      <TeamSelect team={team} onChange={onTeam} />

      <PlankButton onClick={onSubmit} disabled={!canSubmit} block>
        입장하기
      </PlankButton>
    </FormCard>
  );
}
