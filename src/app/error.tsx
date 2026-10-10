"use client";

import Link from "next/link";

export default function ErrorPage({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col items-start gap-4 px-4 py-10">
      <h1 className="text-2xl font-bold">문제가 생겼어요</h1>
      <p className="text-zinc-600 dark:text-zinc-400">화면을 불러오지 못했어요. 다시 시도해도 안 되면 첫 화면으로 돌아가 주세요.</p>
      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={reset} className="btn-primary">
          다시 시도
        </button>
        <Link href="/" className="btn-secondary">
          첫 화면으로
        </Link>
      </div>
    </main>
  );
}
