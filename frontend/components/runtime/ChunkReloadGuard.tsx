"use client";

import { useEffect } from "react";

const CHUNK_RELOAD_KEY = "__benela_chunk_reload_once__";

const stringifyReason = (reason: unknown): string => {
  if (!reason) return "";
  if (typeof reason === "string") return reason;
  if (reason instanceof Error) return `${reason.name} ${reason.message}`;
  try {
    return JSON.stringify(reason);
  } catch {
    return String(reason);
  }
};

const isChunkLoadFailure = (reason: unknown): boolean => {
  const text = stringifyReason(reason).toLowerCase();
  return text.includes("chunkloaderror") || text.includes("failed to load chunk");
};

export default function ChunkReloadGuard() {
  useEffect(() => {
    const reloadOnce = () => {
      try {
        if (sessionStorage.getItem(CHUNK_RELOAD_KEY) === "1") return;
        sessionStorage.setItem(CHUNK_RELOAD_KEY, "1");
      } catch {
        // ignore storage issues; proceed with reload
      }
      window.location.reload();
    };

    const onError = (event: ErrorEvent) => {
      if (isChunkLoadFailure(event.error || event.message)) {
        reloadOnce();
      }
    };

    const onUnhandledRejection = (event: PromiseRejectionEvent) => {
      if (isChunkLoadFailure(event.reason)) {
        reloadOnce();
      }
    };

    window.addEventListener("error", onError);
    window.addEventListener("unhandledrejection", onUnhandledRejection);

    const cleanup = window.setTimeout(() => {
      try {
        sessionStorage.removeItem(CHUNK_RELOAD_KEY);
      } catch {
        // ignore storage issues
      }
    }, 15000);

    return () => {
      window.clearTimeout(cleanup);
      window.removeEventListener("error", onError);
      window.removeEventListener("unhandledrejection", onUnhandledRejection);
    };
  }, []);

  return null;
}

