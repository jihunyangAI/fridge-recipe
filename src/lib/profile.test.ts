import { describe, expect, it } from "vitest";
import { expandAllergens, findAllergen, profileInputSchema } from "./profile";

describe("allergens", () => {
  it("expands known groups and keeps custom entries", () => {
    const terms = expandAllergens(["우유", "고수"]);
    expect(terms).toEqual(expect.arrayContaining(["우유", "치즈", "버터", "생크림", "고수"]));
  });

  it("finds allergens in ingredient names and titles, ignoring spaces", () => {
    const terms = expandAllergens(["계란", "갑각류"]);
    expect(findAllergen(["밥", "달걀 2개"], terms)).toBe("달걀");
    expect(findAllergen(["새우 볶음밥"], terms)).toBe("새우");
    expect(findAllergen(["꽃게탕"], terms)).toBe("게");
    expect(findAllergen(["밥", "대파"], terms)).toBeNull();
  });

  it("catches processed foods that contain the allergen", () => {
    expect(findAllergen(["마요네즈"], expandAllergens(["계란"]))).toBe("마요네즈");
    expect(findAllergen(["굴소스"], expandAllergens(["조개류"]))).toBe("굴");
    expect(findAllergen(["진간장"], expandAllergens(["대두"]))).toBe("간장");
  });

  it("checks text inside parentheses (the model writes notes there)", () => {
    expect(findAllergen(["드레싱(마요네즈)"], expandAllergens(["계란"]))).toBe("마요네즈");
    expect(findAllergen(["양념장(간장, 설탕)"], expandAllergens(["대두"]))).toBe("간장");
    expect(findAllergen(["소스 (땅콩버터)"], expandAllergens(["땅콩"]))).toBe("땅콩");
    expect(findAllergen(["육수(새우)"], expandAllergens(["갑각류"]))).toBe("새우");
  });

  it("keeps custom allergies written with parentheses", () => {
    expect(expandAllergens(["(고수)"])).toEqual(["고수"]);
    expect(expandAllergens(["(땅콩)"])).toEqual(expect.arrayContaining(["땅콩", "피넛"]));
  });

  it("can ignore one-letter terms for prose such as recipe titles", () => {
    const terms = expandAllergens(["갑각류"]);
    expect(findAllergen(["부드럽게 볶은 두부"], terms)).toBe("게");
    expect(findAllergen(["부드럽게 볶은 두부"], terms, 2)).toBeNull();
    expect(findAllergen(["새우 볶음밥"], terms, 2)).toBe("새우");
  });

  it("covers common items the first version missed", () => {
    expect(findAllergen(["피시소스"], expandAllergens(["생선"]))).not.toBeNull();
    expect(findAllergen(["스파게티 면"], expandAllergens(["밀"]))).not.toBeNull();
    expect(findAllergen(["모짜렐라"], expandAllergens(["우유"]))).not.toBeNull();
    expect(findAllergen(["노른자"], expandAllergens(["계란"]))).not.toBeNull();
    expect(findAllergen(["우삼겹"], expandAllergens(["쇠고기"]))).not.toBeNull();
  });

  it("returns nothing when there are no allergies", () => {
    expect(findAllergen(["계란"], expandAllergens([]))).toBeNull();
  });
});

describe("profileInputSchema", () => {
  it("trims and de-duplicates lists", () => {
    const parsed = profileInputSchema.parse({
      nickname: " 지훈 ",
      allergies: ["계란", " 계란 ", "우유"],
      dislikedIngredients: [],
      dietType: "일반",
      defaultServings: 2,
    });
    expect(parsed).toMatchObject({ nickname: "지훈", allergies: ["계란", "우유"] });
  });

  it.each([
    ["short nickname", { nickname: "a" }],
    ["unknown diet", { dietType: "육식" }],
    ["servings out of range", { defaultServings: 5 }],
  ])("rejects %s", (_label, patch) => {
    const base = { nickname: "지훈", allergies: [], dislikedIngredients: [], dietType: "일반", defaultServings: 2 };
    expect(profileInputSchema.safeParse({ ...base, ...patch }).success).toBe(false);
  });
});
