"use client";

import { useSyncExternalStore } from "react";

/**
 * sessionStorage 한 키를 React 외부 저장소로 감싼다. 새로고침해도 값이 유지되고,
 * 같은 탭의 여러 화면이 같은 값을 본다. 저장소를 쓸 수 없으면 메모리 값만 유지한다.
 * 서버 렌더링과 하이드레이션 중에는 null을 돌려준다.
 */
export function createSessionStore<T>(key: string, isValid: (value: unknown) => value is T) {
  let current: T | null | undefined; // undefined = 아직 안 읽음
  const listeners = new Set<() => void>();

  function get(): T | null {
    if (current === undefined) {
      try {
        const raw = sessionStorage.getItem(key);
        const parsed: unknown = raw ? JSON.parse(raw) : null;
        current = isValid(parsed) ? parsed : null;
      } catch {
        current = null;
      }
    }
    return current;
  }

  function save(next: T | null) {
    current = next;
    try {
      if (next === null) sessionStorage.removeItem(key);
      else sessionStorage.setItem(key, JSON.stringify(next));
    } catch {}
    listeners.forEach((notify) => notify());
  }

  function subscribe(listener: () => void) {
    listeners.add(listener);
    return () => listeners.delete(listener);
  }

  function useValue(): T | null {
    return useSyncExternalStore(subscribe, get, () => null);
  }

  return { get, save, useValue };
}

const noopSubscribe = () => () => {};

/** 하이드레이션이 끝나 브라우저 값(sessionStorage 등)을 읽을 수 있으면 true */
export function useHydrated(): boolean {
  return useSyncExternalStore(
    noopSubscribe,
    () => true,
    () => false,
  );
}
