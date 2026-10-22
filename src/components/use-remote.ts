"use client";
import { useEffect, useState } from "react";
export function useRemote<T>(url: string | null, revision?: unknown) {
  const [state, setState] = useState<{
    url: string | null;
    data: T | null;
    error: string | null;
    loading: boolean;
  }>({ url: null, data: null, error: null, loading: false });
  useEffect(() => {
    if (!url) return;
    const controller = new AbortController();
    setState({ url, data: null, error: null, loading: true });
    fetch(url, { signal: controller.signal, cache: "no-store" })
      .then(async (r) => {
        if (!r.ok)
          throw new Error(
            r.status === 401
              ? "Sign in to continue."
              : "Could not load data. Refresh to retry.",
          );
        return r.json();
      })
      .then((data) => setState({ url, data, error: null, loading: false }))
      .catch((e) => {
        if (!controller.signal.aborted)
          setState({ url, data: null, error: e.message, loading: false });
      });
    return () => controller.abort();
  }, [url, revision]);
  return state.url === url
    ? state
    : { url, data: null, error: null, loading: !!url };
}
