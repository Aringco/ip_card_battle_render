'use client';

export function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-sm text-gray-500 mb-1">{label}</label>
      {children}
    </div>
  );
}

/**
 * 폼 카드 — 확장된 패널 배경 위에 얹히는 반투명 흰 카드.
 *
 * 뒤로가기는 스테이지 아래 전용 버튼(BackButton)이 담당하므로 카드 안에는 두지 않는다.
 * 스테이지 높이가 고정이라 내용이 길어지면 감싸는 .stage-form이 안에서 스크롤한다.
 *
 * description이 문자열이 아니라 ReactNode인 이유 — 폼은 세로로 늘어날 수 없어서
 * (position:absolute), 경고를 새 줄로 덧붙이는 대신 **이 한 줄을 갈아끼워** 쓴다.
 * 방 만들기의 팀 이름 충돌 경고가 그 예다.
 */
export function FormCard({
  title,
  description,
  children,
}: {
  title: string;
  description?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-full flex items-center justify-center p-4">
      <div className="w-full max-w-md bg-white/95 backdrop-blur-sm rounded-2xl shadow-lg p-5 flex flex-col gap-3">
        <div>
          <h3 className="font-bold text-gray-700">{title}</h3>
          {description && <p className="text-xs text-gray-400 mt-0.5">{description}</p>}
        </div>
        {children}
      </div>
    </div>
  );
}
