import { SavedRecipeList } from "@/components/saved-recipes";

export default function MyRecipesPage() {
  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-6 px-4 py-10">
      <h1 className="text-2xl font-bold">내 레시피</h1>
      <SavedRecipeList />
    </main>
  );
}
