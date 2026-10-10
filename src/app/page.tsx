import { FridgeRecognizer } from "@/components/fridge-recognizer";

export default function Home() {
  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-6 px-4 py-10">
      <header className="flex flex-col gap-2">
        <h1 className="text-3xl font-bold">냉장고부탁해</h1>
        <p className="text-zinc-600 dark:text-zinc-400">
          냉장고 사진을 올리면 재료를 찾아드려요. 결과를 고친 뒤 레시피를 추천받으세요.
        </p>
      </header>
      <FridgeRecognizer />
    </main>
  );
}
