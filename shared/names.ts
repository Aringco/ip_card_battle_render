/**
 * 무작위 이름 생성 — 닉네임과 팀 이름.
 *
 * 닉네임: {형용사} {동물}, 팀 이름: {지식재산권} {조직}.
 * 두 조합 모두 "공백 1칸으로 이어붙인 두 단어"이고, 클라이언트 입력창(닉네임 12자,
 * 팀 이름 TEAM_NAME_MAX_LEN=12)에 그대로 들어가야 하므로 각 단어 길이는
 * 합쳐서 12자를 넘지 않게 유지한다(형용사·동물 모두 최대 5자).
 */

export const NICKNAME_ADJECTIVES = [
  '배고픈', '신나는', '슬픈', '강한', '짜릿한', '용감한', '게으른', '수줍은',
  '엉뚱한', '씩씩한', '상냥한', '도도한', '명랑한', '재빠른', '느긋한', '똑똑한',
  '우아한', '다정한', '냉철한', '화끈한', '든든한', '발랄한', '진지한', '소심한',
  '대범한', '유쾌한', '나른한', '야무진', '정직한', '억울한', '배부른', '졸린',
  '목마른', '사나운', '귀여운', '늠름한', '수상한', '태연한', '침착한', '뻔뻔한',
  '심술궂은', '반짝이는', '지혜로운', '낭만적인', '고집스런', '어색한', '뿌듯한',
  '새침한', '깜찍한', '늦잠자는', '춤추는', '노래하는', '달리는', '헤엄치는',
  '잠꾸러기', '개구쟁이', '천하무적', '전설적인', '불타는', '얼어붙은', '번쩍이는', '조용한', '시끄러운', '느릿한', '부지런한',
] as const;

export const NICKNAME_ANIMALS = [
  '호랑이', '토끼', '사자', '여우', '늑대', '곰', '판다', '코알라',
  '수달', '라쿤', '다람쥐', '고슴도치', '두더지', '미어캣', '알파카', '라마',
  '카피바라', '하마', '코뿔소', '기린', '얼룩말', '코끼리', '원숭이', '침팬지',
  '고릴라', '나무늘보', '앵무새', '부엉이', '올빼미', '펭귄', '갈매기', '참새',
  '까치', '딱따구리', '홍학', '두루미', '백조', '오리', '거위', '독수리',
  '고양이', '강아지', '햄스터', '고래', '돌고래', '상어', '문어', '해파리',
  '불가사리', '거북이', '도마뱀', '카멜레온', '개구리', '도롱뇽', '달팽이',
  '무당벌레', '사슴벌레', '잠자리', '나비', '개미', '꿀벌', '사슴', '노루',
  '양', '염소', '당나귀', '족제비', '오소리', '고라니', '순록', '북극곰',
  '바다표범', '펠리컨', '까마귀', '비둘기', '제비', '올챙이', '메뚜기',
] as const;

/** 팀 이름 앞 단어 — 4대 지식재산권 + 저작권 */
export const TEAM_NAME_SUBJECTS = ['특허', '상표', '실용신안', '디자인', '저작권'] as const;

/** 팀 이름 뒷 단어 — 지키는 쪽과 부수는 쪽이 섞여 있다 */
export const TEAM_NAME_SUFFIXES = [
  '수호대', '지키미', '기사단', '파괴자', '괴물', '변호단', '개발팀', '관리자', '출원모임',
] as const;

/** 팀 이름 후보 전체(5 × 9 = 45개) */
export const TEAM_NAME_POOL: readonly string[] = TEAM_NAME_SUBJECTS.flatMap(subject =>
  TEAM_NAME_SUFFIXES.map(suffix => `${subject} ${suffix}`),
);

function pick<T>(list: readonly T[]): T {
  return list[Math.floor(Math.random() * list.length)];
}

/** `{형용사} {동물}` 무작위 닉네임 */
export function randomNickname(): string {
  return `${pick(NICKNAME_ADJECTIVES)} ${pick(NICKNAME_ANIMALS)}`;
}

/**
 * `{지식재산권} {조직}` 무작위 팀 이름.
 * `exclude`(보통 상대 팀 이름)와 같은 이름은 물론, 앞 단어까지 겹치는 후보도 제외한다
 * — "특허 수호대 vs 특허 파괴자"처럼 앞 단어가 같으면 화면에서 순간적으로 헷갈린다.
 */
export function randomTeamName(exclude?: string | null): string {
  const excludedSubject = exclude?.split(' ')[0] ?? null;
  const pool = TEAM_NAME_POOL.filter(
    name => name !== exclude && (excludedSubject === null || !name.startsWith(`${excludedSubject} `)),
  );
  return pick(pool.length > 0 ? pool : TEAM_NAME_POOL);
}
