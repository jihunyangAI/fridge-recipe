"use client";

import { useState } from "react";
import { CATEGORIES, type Category, type Ingredient } from "@/lib/ingredients";

type Props = {
  ingredients: Ingredient[];
  onChange: (next: Ingredient[]) => void;
};

export function IngredientEditor({ ingredients, onChange }: Props) {
  const update = (index: number, patch: Partial<Ingredient>) =>
    onChange(ingredients.map((item, i) => (i === index ? { ...item, ...patch } : item)));
  const remove = (index: number) => onChange(ingredients.filter((_, i) => i !== index));

  // 원래 목록의 인덱스를 유지한 채 카테고리별로 묶는다.
  const groups = CATEGORIES.map((category) => ({
    category,
    items: ingredients
      .map((item, index) => ({ item, index }))
      .filter(({ item }) => item.category === category),
  })).filter((g) => g.items.length > 0);

  return (
    <div className="flex flex-col gap-5">
      {groups.map(({ category, items }) => (
        <div key={category}>
          <h3 className="mb-2 text-sm font-medium text-zinc-500">{category}</h3>
          <ul className="flex flex-col gap-2">
            {items.map(({ item, index }) => (
              <li
                key={index}
                className="flex items-center gap-2 rounded-xl border border-zinc-200 p-2 dark:border-zinc-800"
              >
                <div className="flex min-w-0 flex-1 flex-col gap-1">
                  <input
                    aria-label="재료 이름"
                    value={item.name}
                    // 사용자가 이름을 고쳤다면 확인한 것으로 본다.
                    onChange={(e) => update(index, { name: e.target.value, confidence: "high" })}
                    onBlur={(e) => {
                      if (!e.target.value.trim()) remove(index);
                    }}
                    className="input w-full"
                  />
                  {item.confidence === "low" && (
                    <span className="self-start rounded-full bg-amber-100 px-2 py-0.5 text-xs text-amber-800 dark:bg-amber-900/50 dark:text-amber-200">
                      확인 필요
                    </span>
                  )}
                </div>
                <input
                  aria-label="양"
                  placeholder="양"
                  value={item.quantity ?? ""}
                  onChange={(e) => update(index, { quantity: e.target.value || null })}
                  className="input w-24 shrink-0 self-start"
                />
                <button
                  type="button"
                  onClick={() => remove(index)}
                  aria-label={`${item.name} 삭제`}
                  className="shrink-0 self-start rounded-lg px-2 py-2 text-zinc-400 hover:bg-zinc-100 hover:text-red-600 dark:hover:bg-zinc-800"
                >
                  ✕
                </button>
              </li>
            ))}
          </ul>
        </div>
      ))}
      <AddIngredientForm onAdd={(item) => onChange([...ingredients, item])} />
    </div>
  );
}

function AddIngredientForm({ onAdd }: { onAdd: (item: Ingredient) => void }) {
  const [name, setName] = useState("");
  const [quantity, setQuantity] = useState("");
  const [category, setCategory] = useState<Category>("기타");

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        const trimmed = name.trim();
        if (!trimmed) return;
        // 사용자가 직접 넣은 재료는 확실한 것으로 본다.
        onAdd({ name: trimmed, quantity: quantity.trim() || null, category, confidence: "high" });
        setName("");
        setQuantity("");
      }}
      className="flex flex-wrap items-center gap-2 rounded-xl bg-zinc-50 p-2 dark:bg-zinc-900"
    >
      <input
        aria-label="추가할 재료 이름"
        placeholder="재료 직접 추가"
        value={name}
        onChange={(e) => setName(e.target.value)}
        maxLength={30}
        className="input min-w-0 flex-1 basis-32"
      />
      <input
        aria-label="추가할 재료 양"
        placeholder="양 (선택)"
        value={quantity}
        onChange={(e) => setQuantity(e.target.value)}
        className="input w-24"
      />
      <select
        aria-label="분류"
        value={category}
        onChange={(e) => setCategory(e.target.value as Category)}
        className="input w-28"
      >
        {CATEGORIES.map((c) => (
          <option key={c}>{c}</option>
        ))}
      </select>
      <button type="submit" disabled={!name.trim()} className="btn-secondary">
        추가
      </button>
    </form>
  );
}
