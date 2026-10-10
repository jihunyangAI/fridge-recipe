import { sql } from "drizzle-orm";
import { index, integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

// PRD_step3.md 4절 데이터 모델. 시각은 epoch ms 정수로 저장한다.

export const users = sqliteTable("users", {
  id: text("id").primaryKey(),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  createdAt: integer("created_at").notNull(),
});

export const profiles = sqliteTable("profiles", {
  userId: text("user_id")
    .primaryKey()
    .references(() => users.id, { onDelete: "cascade" }),
  nickname: text("nickname").notNull(),
  allergies: text("allergies", { mode: "json" }).$type<string[]>().notNull().default(sql`'[]'`),
  dislikedIngredients: text("disliked_ingredients", { mode: "json" })
    .$type<string[]>()
    .notNull()
    .default(sql`'[]'`),
  dietType: text("diet_type").notNull().default("일반"),
  defaultServings: integer("default_servings").notNull().default(2),
  updatedAt: integer("updated_at").notNull(),
});

export const savedRecipes = sqliteTable(
  "saved_recipes",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    recipeId: text("recipe_id").notNull(),
    title: text("title").notNull(),
    cuisine: text("cuisine"),
    recipeJson: text("recipe_json").notNull(),
    sourceIngredients: text("source_ingredients").notNull(),
    memo: text("memo"),
    createdAt: integer("created_at").notNull(),
  },
  (t) => [
    uniqueIndex("saved_recipes_user_recipe").on(t.userId, t.recipeId),
    index("saved_recipes_user_created").on(t.userId, t.createdAt),
  ],
);
