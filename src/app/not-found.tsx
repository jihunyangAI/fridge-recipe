import Link from "next/link";

export default function NotFound() {
  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col items-start gap-4 px-4 py-10">
      <h1 className="text-2xl font-bold">페이지를 찾을 수 없어요</h1>
      <p className="text-zinc-600 dark:text-zinc-400">주소가 잘못됐거나 없어진 페이지예요.</p>
      <Link href="/" className="btn-primary">
        첫 화면으로 가기
      </Link>
    </main>
  );
}
