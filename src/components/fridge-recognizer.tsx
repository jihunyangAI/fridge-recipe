"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ACCEPTED_TYPES, MAX_UPLOAD_BYTES, resizeImage } from "@/lib/resize-image";
import { saveIngredients, useStoredIngredients } from "@/lib/ingredient-store";
import type { RecognizeResult } from "@/lib/ingredients";
import { IngredientEditor } from "./ingredient-editor";

const REQUEST_TIMEOUT_MS = 60_000;
// 이 시간이 지나도 응답이 없으면 서버가 429 재시도 중일 가능성이 높다.
const SLOW_HINT_MS = 8_000;

export function FridgeRecognizer() {
  const router = useRouter();
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [slow, setSlow] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // 새로고침해도 편집 중인 재료 목록이 유지되도록 sessionStorage에 둔다. null이면 인식 전.
  const ingredients = useStoredIngredients();
  const [notes, setNotes] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const cameraInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  function selectFile(selected: File | undefined) {
    setError(null);
    if (!selected) return;
    if (!ACCEPTED_TYPES.includes(selected.type)) {
      setError("JPG, PNG, WebP 이미지만 올릴 수 있어요.");
      return;
    }
    if (selected.size > MAX_UPLOAD_BYTES) {
      setError("이미지는 10MB 이하만 올릴 수 있어요.");
      return;
    }
    setFile(selected);
    setPreviewUrl(URL.createObjectURL(selected));
  }

  async function recognize() {
    if (!file) return;
    setLoading(true);
    setSlow(false);
    setError(null);
    const slowTimer = setTimeout(() => setSlow(true), SLOW_HINT_MS);

    try {
      const resized = await resizeImage(file);
      const form = new FormData();
      form.append("image", resized, "fridge.jpg");

      const res = await fetch("/api/recognize", {
        method: "POST",
        body: form,
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
      const body = await res.json().catch(() => null);
      if (!res.ok) {
        throw new Error(body?.error ?? "사진을 분석하지 못했어요. 잠시 후 다시 시도해 주세요.");
      }
      const result = body as RecognizeResult;
      saveIngredients(result.ingredients);
      setNotes(result.notes);
    } catch (e) {
      const timedOut = e instanceof DOMException && e.name === "TimeoutError";
      setError(
        timedOut
          ? "응답이 너무 오래 걸려요. 잠시 후 다시 시도해 주세요."
          : e instanceof Error
            ? e.message
            : "알 수 없는 오류가 발생했어요.",
      );
    } finally {
      clearTimeout(slowTimer);
      setLoading(false);
    }
  }

  function reset() {
    setFile(null);
    setPreviewUrl(null);
    setNotes(null);
    setError(null);
    saveIngredients(null);
  }

  return (
    <div className="flex flex-col gap-6">
      <section
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          selectFile(e.dataTransfer.files[0]);
        }}
        className={`flex flex-col items-center gap-4 rounded-2xl border-2 border-dashed p-6 transition-colors ${
          dragging ? "border-emerald-500 bg-emerald-50 dark:bg-emerald-950/30" : "border-zinc-300 dark:border-zinc-700"
        }`}
      >
        {previewUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- 로컬 blob 미리보기라 next/image 최적화 대상이 아니다
          <img src={previewUrl} alt="업로드한 냉장고 사진 미리보기" className="max-h-80 w-auto rounded-lg object-contain" />
        ) : (
          <p className="text-center text-zinc-500">
            냉장고 사진을 여기로 끌어다 놓거나
            <br />
            아래 버튼으로 선택하세요
          </p>
        )}

        <div className="flex flex-wrap justify-center gap-2">
          <button type="button" onClick={() => fileInput.current?.click()} className="btn-secondary">
            {file ? "다른 사진 선택" : "사진 선택"}
          </button>
          <button type="button" onClick={() => cameraInput.current?.click()} className="btn-secondary sm:hidden">
            사진 찍기
          </button>
        </div>
        <input
          ref={fileInput}
          type="file"
          accept={ACCEPTED_TYPES.join(",")}
          className="hidden"
          onChange={(e) => {
            selectFile(e.target.files?.[0]);
            e.target.value = "";
          }}
        />
        <input
          ref={cameraInput}
          type="file"
          accept="image/*"
          capture="environment"
          className="hidden"
          onChange={(e) => {
            selectFile(e.target.files?.[0]);
            e.target.value = "";
          }}
        />

        <button
          type="button"
          onClick={recognize}
          disabled={!file || loading}
          className="btn-primary w-full sm:w-auto"
        >
          {loading ? "재료를 찾는 중…" : "재료 인식하기"}
        </button>
        {loading && slow && (
          <p className="text-sm text-amber-600" role="status">
            요청이 많아 다시 시도하는 중이에요. 최대 1분 정도 걸릴 수 있어요…
          </p>
        )}
      </section>

      {error && (
        <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-300">
          {error}
        </p>
      )}

      {ingredients && (
        <section className="flex flex-col gap-4">
          <div className="flex items-baseline justify-between">
            <h2 className="text-xl font-semibold">인식된 재료 ({ingredients.length})</h2>
            <button type="button" onClick={reset} className="text-sm text-zinc-500 underline">
              처음부터
            </button>
          </div>
          {notes && <p className="text-sm text-zinc-500">참고: {notes}</p>}
          {ingredients.length === 0 && (
            <p className="text-sm text-zinc-600 dark:text-zinc-400">
              재료를 찾지 못했어요. 더 밝게 찍거나 아래에서 직접 추가해 주세요.
            </p>
          )}
          <IngredientEditor ingredients={ingredients} onChange={saveIngredients} />
          <button
            type="button"
            onClick={() => router.push("/recipes")}
            disabled={ingredients.length === 0}
            className="btn-primary"
          >
            이 재료로 레시피 추천받기
          </button>
        </section>
      )}
    </div>
  );
}
