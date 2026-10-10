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
