import { z } from "zod";

export const DIET_TYPES = ["일반", "채식(락토오보)", "비건", "저탄수화물"] as const;
export type DietType = (typeof DIET_TYPES)[number];

/**
 * 알레르기 선택지와, 각 알레르기에 걸리는 재료 이름. 식약처 알레르기 유발물질 표시 대상을 바탕으로
 * 가정 요리에 흔한 가공식품을 더했다. 안전을 위해 넓게 잡는다 (조금 과하게 걸러내는 쪽을 택함).
 */
export const ALLERGEN_GROUPS: Record<string, readonly string[]> = {
  계란: ["계란", "달걀", "메추리알", "마요네즈"],
  우유: ["우유", "치즈", "버터", "요거트", "요구르트", "생크림", "크림", "연유", "분유"],
  땅콩: ["땅콩", "피넛"],
  견과류: ["견과", "호두", "아몬드", "잣", "캐슈", "피스타치오", "헤이즐넛", "마카다미아"],
  밀: ["밀", "빵", "면", "파스타", "국수", "라면", "우동", "부침가루", "튀김가루", "만두피", "또띠아"],
  대두: ["대두", "콩", "두부", "된장", "간장", "두유", "고추장", "춘장"],
  메밀: ["메밀"],
  갑각류: ["새우", "게", "랍스터", "가재", "크랩"],
  조개류: ["조개", "바지락", "홍합", "굴", "전복", "가리비", "꼬막"],
  생선: ["생선", "고등어", "연어", "참치", "멸치", "갈치", "대구", "명태", "동태", "황태", "꽁치", "삼치", "어묵", "액젓"],
  오징어: ["오징어", "한치"],
  복숭아: ["복숭아"],
  토마토: ["토마토", "케첩"],
  돼지고기: ["돼지고기", "삼겹살", "목살", "베이컨", "햄", "소시지"],
  닭고기: ["닭", "치킨"],
  쇠고기: ["쇠고기", "소고기", "차돌", "등심", "안심"],
};

export const ALLERGEN_OPTIONS = Object.keys(ALLERGEN_GROUPS);

export type Profile = {
  nickname: string;
  allergies: string[];
  dislikedIngredients: string[];
  dietType: DietType;
  defaultServings: number;
};

const uniqueList = (max: number, maxLength: number) =>
  z
    .array(z.string().trim().min(1).max(maxLength))
    .max(max)
    .transform((items) => [...new Set(items)]);

export const profileInputSchema = z.object({
  nickname: z.string().trim().min(2).max(20),
  allergies: uniqueList(20, 20),
  dislikedIngredients: uniqueList(30, 20),
  dietType: z.enum(DIET_TYPES),
  defaultServings: z.number().int().min(1).max(4),
});

const compact = (s: string) => s.replace(/\(.*?\)/g, "").replace(/\s+/g, "").toLowerCase();

/** 사용자의 알레르기 목록을 실제로 검사할 재료 이름들로 펼친다. 목록에 없는 항목은 그 이름 그대로 쓴다. */
export function expandAllergens(allergies: string[]): string[] {
  const terms = allergies.flatMap((a) => [a, ...(ALLERGEN_GROUPS[a] ?? [])]);
  return [...new Set(terms.map(compact).filter(Boolean))];
}

/**
 * texts(재료 이름, 요리 제목 등) 중 하나라도 알레르기 재료를 포함하면 그 재료 이름을 돌려준다.
 * 한 글자 이름("게", "밀")도 포함 여부로 검사한다. 놓치는 것보다 과하게 거르는 편이 안전하다.
 */
export function findAllergen(texts: string[], allergenTerms: string[]): string | null {
  for (const text of texts) {
    const t = compact(text);
    const hit = allergenTerms.find((term) => t.includes(term));
    if (hit) return hit;
  }
  return null;
}
