"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { api, ApiError } from "@/lib/api-client";
import type { SavedRecipeDetail, SavedRecipeSummary } from "@/lib/db/repo";
import { CUISINES } from "@/lib/recipes";
import { useRequireAuth } from "@/lib/use-auth";
import { ErrorText } from "./auth-forms";
import { Chip } from "./profile-form";
import { RecipeDetail } from "./recipe-detail";

type ListResponse = { items: SavedRecipeSummary[]; total: number; page: number; pageSize: number };

export function SavedRecipeList() {
  const status = useRequireAuth();
  const [draft, setDraft] = useState("");
  const [query, setQuery] = useState({ q: "", cuisine: "", page: 1 });
  const [data, setData] = useState<ListResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (status !== "authenticated") return;
    let cancelled = false;
    const params = new URLSearchParams({ page: String(query.page) });
    if (query.q) params.set("q", query.q);
    if (query.cuisine) params.set("cuisine", query.cuisine);
    api<ListResponse>(`/api/saved-recipes?${params}`)
      .then((d) => {
        if (cancelled) return;
        setData(d);
        setError(null);
      })
      .catch((e) => !cancelled && setError(e instanceof ApiError ? e.message : "목록을 불러오지 못했어요."));
    return () => {
      cancelled = true;
    };
  }, [status, query]);

  if (status !== "authenticated") return <p className="text-zinc-500">불러오는 중…</p>;
  const pages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1;
  const filtered = !!(query.q || query.cuisine);

  return (
    <div className="flex flex-col gap-5">
      <form
        role="search"
        onSubmit={(e) => {
          e.preventDefault();
          setQuery((q) => ({ ...q, q: draft.trim(), page: 1 }));
        }}
        className="flex gap-2"
      >
        <input
          aria-label="제목 검색"
          placeholder="제목으로 검색"
          value={draft}
          maxLength={60}
          onChange={(e) => setDraft(e.target.value)}
          className="input min-w-0 flex-1"
        />
        <button type="submit" className="btn-secondary">
          검색
        </button>
      </form>
      <div className="flex flex-wrap gap-2">
        {["", ...CUISINES].map((c) => (
          <Chip key={c || "all"} selected={query.cuisine === c} onClick={() => setQuery((q) => ({ ...q, cuisine: c, page: 1 }))}>
            {c || "전체"}
          </Chip>
        ))}
      </div>

      {error && <ErrorText>{error}</ErrorText>}
      {!data ? (
        <p className="text-zinc-500">불러오는 중…</p>
      ) : data.items.length === 0 ? (
        <p className="text-zinc-600 dark:text-zinc-400">
          {filtered ? (
            "조건에 맞는 레시피가 없어요."
          ) : (
            <>
              아직 저장한 레시피가 없어요.{" "}
              <Link href="/" className="underline">
                냉장고 사진으로 레시피 찾기
              </Link>
            </>
          )}
        </p>
      ) : (
        <>
          <p className="text-sm text-zinc-500">{data.total}개</p>
          <ul className="flex flex-col gap-3">
            {data.items.map((item) => (
              <li key={item.id}>
                <Link
                  href={`/my-recipes/${item.id}`}
                  className="flex flex-col gap-1 rounded-2xl border border-zinc-200 p-4 hover:border-emerald-500 dark:border-zinc-800"
                >
                  <span className="text-lg font-semibold">{item.title}</span>
                  {item.summary && <span className="text-sm text-zinc-600 dark:text-zinc-400">{item.summary}</span>}
                  <span className="text-xs text-zinc-500">
                    {[item.minutes && `${item.minutes}분`, item.difficulty, item.cuisine].filter(Boolean).join(" · ")}
                    {" · "}
                    {new Date(item.createdAt).toLocaleDateString("ko-KR")} 저장
                  </span>
                  {item.memo && (
                    <span className="mt-1 rounded-lg bg-amber-50 px-2 py-1 text-sm text-amber-900 dark:bg-amber-950/40 dark:text-amber-100">
                      메모: {item.memo}
                    </span>
                  )}
                </Link>
              </li>
            ))}
          </ul>
          {pages > 1 && (
            <nav className="flex items-center justify-center gap-3" aria-label="페이지">
              <button
                type="button"
                disabled={query.page <= 1}
                onClick={() => setQuery((q) => ({ ...q, page: q.page - 1 }))}
                className="btn-secondary"
              >
                이전
              </button>
              <span className="text-sm">
                {query.page} / {pages}
              </span>
              <button
                type="button"
                disabled={query.page >= pages}
                onClick={() => setQuery((q) => ({ ...q, page: q.page + 1 }))}
                className="btn-secondary"
              >
                다음
              </button>
            </nav>
          )}
        </>
      )}
    </div>
  );
}

export function SavedRecipeView() {
  const status = useRequireAuth();
  const router = useRouter();
  const { id } = useParams<{ id: string }>();
  const [saved, setSaved] = useState<SavedRecipeDetail | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (status !== "authenticated") return;
    let cancelled = false;
    api<SavedRecipeDetail>(`/api/saved-recipes/${encodeURIComponent(id)}`)
      .then((d) => !cancelled && setSaved(d))
      .catch((e) => !cancelled && setError(e instanceof ApiError ? e.message : "레시피를 불러오지 못했어요."));
    return () => {
      cancelled = true;
    };
  }, [status, id]);

  if (error)
    return (
      <div className="flex flex-col gap-3">
        <ErrorText>{error}</ErrorText>
        <Link href="/my-recipes" className="text-sm underline">
          ← 내 레시피
        </Link>
      </div>
    );
  if (!saved) return <p className="text-zinc-500">불러오는 중…</p>;

  return (
    <RecipeDetail
      recipe={saved.recipe}
      backLabel="← 내 레시피"
      onBack={() => router.push("/my-recipes")}
      actions={
        <div className="flex flex-col gap-4">
          <MemoEditor savedId={saved.id} initial={saved.memo} />
          <DeleteSaved savedId={saved.id} onDeleted={() => router.replace("/my-recipes")} />
        </div>
      }
    />
  );
}

function MemoEditor({ savedId, initial }: { savedId: string; initial: string | null }) {
  const [memo, setMemo] = useState(initial ?? "");
  const [savedMemo, setSavedMemo] = useState(initial ?? "");
  const [status, setStatus] = useState<{ ok: boolean; text: string } | null>(null);
  const dirty = memo.trim() !== savedMemo;

  return (
    <form
      className="flex flex-col gap-2"
      onSubmit={async (e) => {
        e.preventDefault();
        try {
          const res = await api<{ memo: string | null }>(`/api/saved-recipes/${encodeURIComponent(savedId)}`, {
            method: "PATCH",
            json: { memo },
          });
          setSavedMemo(res.memo ?? "");
          setMemo(res.memo ?? "");
          setStatus({ ok: true, text: "메모를 저장했어요." });
        } catch (err) {
          setStatus({ ok: false, text: err instanceof ApiError ? err.message : "메모를 저장하지 못했어요." });
        }
      }}
    >
      <label className="flex flex-col gap-1 text-sm">
        <span className="font-medium">
          메모 <span className="font-normal text-zinc-500">({memo.length}/500)</span>
        </span>
        <textarea
          value={memo}
          maxLength={500}
          rows={3}
          placeholder="예: 간장 반만 넣으니 딱 맞음"
          onChange={(e) => {
            setMemo(e.target.value);
            setStatus(null);
          }}
          className="input w-full"
        />
      </label>
      <div className="flex items-center gap-3">
        <button type="submit" disabled={!dirty} className="btn-secondary">
          메모 저장
        </button>
        {status && (
          <span role={status.ok ? "status" : "alert"} className={`text-sm ${status.ok ? "text-emerald-700" : "text-red-600"}`}>
            {status.text}
          </span>
        )}
      </div>
    </form>
  );
}

function DeleteSaved({ savedId, onDeleted }: { savedId: string; onDeleted: () => void }) {
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);

  return confirming ? (
    <div className="flex flex-col gap-2 rounded-xl border border-red-200 p-3 dark:border-red-900">
      <p className="text-sm">이 레시피를 내 레시피에서 삭제할까요?</p>
      {error && <ErrorText>{error}</ErrorText>}
      <div className="flex gap-2">
        <button
          type="button"
          onClick={async () => {
            try {
              await api(`/api/saved-recipes/${encodeURIComponent(savedId)}`, { method: "DELETE" });
              onDeleted();
            } catch (e) {
              setError(e instanceof ApiError ? e.message : "삭제하지 못했어요.");
            }
          }}
          className="rounded-xl bg-red-600 px-4 py-2 text-sm font-semibold text-white"
        >
          삭제
        </button>
        <button type="button" onClick={() => setConfirming(false)} className="btn-secondary">
          취소
        </button>
      </div>
    </div>
  ) : (
    <button type="button" onClick={() => setConfirming(true)} className="self-start text-sm text-red-600 underline">
      레시피 삭제
    </button>
  );
}
