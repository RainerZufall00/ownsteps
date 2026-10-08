"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useI18n } from "@/lib/i18n/client";
import { fill } from "@/lib/i18n/text";

type Status = {
  connected: boolean;
  state: "idle" | "running" | "done" | "failed";
  done: number;
  total: number;
  albumUrl: string | null;
  error: string | null;
};

/**
 * Sends the trip to Immich and follows the progress – the export runs on
 * the server, so leaving the page doesn't stop it.
 */
export default function ImmichExport({ tripId, initial }: { tripId: number; initial: Status }) {
  const { t } = useI18n();
  const [status, setStatus] = useState(initial);
  const [starting, setStarting] = useState(false);
  const url = `/api/trips/${tripId}/immich`;

  const load = useCallback(async (init?: RequestInit) => {
    const response = await fetch(url, init);
    const body = await response.json();
    if (!response.ok) throw new Error(body.error ?? String(response.status));
    setStatus(body as Status);
  }, [url]);

  useEffect(() => {
    if (status.state !== "running") return;
    const timer = setInterval(() => void load().catch(() => {}), 1000);
    return () => clearInterval(timer);
  }, [status.state, load]);

  async function start() {
    setStarting(true);
    try {
      await load({ method: "POST" });
    } catch (error) {
      setStatus((current) => ({ ...current, state: "failed", error: (error as Error).message }));
    } finally {
      setStarting(false);
    }
  }

  if (!status.connected) {
    return (
      <p className="text-[15px] text-ink-soft">
        {t.exportTrip.immichNotConnected}{" "}
        <Link href="/settings" className="font-semibold text-accent">
          {t.exportTrip.immichConnect}
        </Link>
      </p>
    );
  }

  const running = status.state === "running" || starting;
  const progress = status.total ? status.done / status.total : 0;

  return (
    <div className="space-y-3">
      {running ? (
        <div className="space-y-2" aria-live="polite">
          <div className="h-2 overflow-hidden rounded-full bg-surface-muted">
            <div className="h-full rounded-full bg-accent transition-all" style={{ width: `${progress * 100}%` }} />
          </div>
          <p className="text-sm text-ink-soft">
            {status.total
              ? fill(t.exportTrip.immichRunning, { done: status.done, total: status.total })
              : t.exportTrip.immichStarting}
          </p>
        </div>
      ) : (
        <button type="button" onClick={start} className="btn btn-secondary">
          {status.state === "done" ? t.exportTrip.immichAgain : t.exportTrip.immich}
        </button>
      )}
      {status.state === "done" && (
        <p className="text-sm font-medium text-sea">
          {fill(t.exportTrip.immichDone, { total: status.total })}{" "}
          {status.albumUrl && (
            <a href={status.albumUrl} target="_blank" rel="noreferrer" className="font-semibold text-accent">
              {t.exportTrip.immichOpen}
            </a>
          )}
        </p>
      )}
      {status.state === "failed" && status.error && (
        <p className="text-sm font-medium text-accent">{fill(t.exportTrip.immichFailed, { error: status.error })}</p>
      )}
    </div>
  );
}
