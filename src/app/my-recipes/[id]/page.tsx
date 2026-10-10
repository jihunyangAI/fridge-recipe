import { Suspense } from "react";
import { SavedRecipeView } from "@/components/saved-recipes";

// params는 서버에서 기다리지 않고 클라이언트(useParams)에서 읽는다. 동적 경로라 URL 값은
// 요청 때에만 알 수 있으므로 Suspense 안에 두어 나머지 셸은 미리 렌더링되게 한다.
export default function SavedRecipePage() {
  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-6 px-4 py-10">
      <Suspense fallback={<p className="text-zinc-500">불러오는 중…</p>}>
        <SavedRecipeView />
      </Suspense>
    </main>
  );
}
