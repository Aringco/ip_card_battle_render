'use client';

import type { Team } from 'shared';
import { Field } from './Field';

export function TeamSelect({ team, onChange }: { team: Team; onChange: (t: Team) => void }) {
  return (
    <Field label="팀 선택">
      <div className="flex gap-2">
        {(['A', 'B'] as Team[]).map(t => (
          <button
            key={t}
            type="button"
            onClick={() => onChange(t)}
            className={`flex-1 py-2 rounded-lg font-semibold transition text-sm ${
              team === t
                ? 'bg-jungle-600 text-white'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200 ring-1 ring-gray-300'
            }`}
          >
            {t === 'A' ? '🟢 팀 1' : '🔵 팀 2'}
          </button>
        ))}
      </div>
    </Field>
  );
}
