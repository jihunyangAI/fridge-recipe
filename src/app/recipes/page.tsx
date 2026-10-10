import { RecipePlanner } from "@/components/recipe-planner";

export default function RecipesPage() {
  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-6 px-4 py-10">
      <h1 className="text-2xl font-bold">레시피 추천</h1>
      <RecipePlanner />
    </main>
  );
}
