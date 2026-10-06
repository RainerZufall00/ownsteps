"use client";

import { useEffect, type RefObject } from "react";
import { VIEW_BATCH_MAX } from "@/lib/limits";

/** How long a step must be on screen before it counts as read. */
const DWELL_MS = 1000;
/** Reports are collected and sent at most this often. */
const FLUSH_MS = 2000;

/**
 * Tells the server which steps a share-link visitor has read, so the authors
 * see how often each step was seen. A step counts once it filled a good part
 * of the screen for a second – scrolling past doesn't. Each step is reported
 * once per page view; the server counts each visitor once anyway.
 */
export function useStepViews(
  shareToken: string | undefined,
  elements: RefObject<Map<number, HTMLElement>>,
  steps: unknown,
) {
  useEffect(() => {
    if (!shareToken) return;
    const targets = [...elements.current.values()];
    if (targets.length === 0) return;

    const reported = new Set<number>();
    const pending = new Set<number>();
    const timers = new Map<number, number>();

    const flush = () => {
      const stepIds = [...pending];
      pending.clear();
      for (let i = 0; i < stepIds.length; i += VIEW_BATCH_MAX) {
        // Fire and forget: a lost report only means one view fewer.
        void fetch(`/api/share-views/${encodeURIComponent(shareToken)}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ stepIds: stepIds.slice(i, i + VIEW_BATCH_MAX) }),
          // Still goes out when the visitor leaves the page.
          keepalive: true,
        }).catch(() => {});
      }
    };

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          const id = Number((entry.target as HTMLElement).dataset.stepId);
          if (!Number.isInteger(id) || reported.has(id)) continue;
          // Mostly visible, or – for a tall step – filling much of the screen.
          const seen =
            entry.isIntersecting &&
            (entry.intersectionRatio >= 0.6 ||
              entry.intersectionRect.height >= window.innerHeight * 0.4);
          if (seen && !timers.has(id)) {
            const timer = window.setTimeout(() => {
              timers.delete(id);
              reported.add(id);
              pending.add(id);
            }, DWELL_MS);
            timers.set(id, timer);
          } else if (!seen && timers.has(id)) {
            window.clearTimeout(timers.get(id));
            timers.delete(id);
          }
        }
      },
      { threshold: [0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1] },
    );
    targets.forEach((target) => observer.observe(target));

    const interval = window.setInterval(flush, FLUSH_MS);
    const onHide = () => {
      if (document.visibilityState === "hidden") flush();
    };
    document.addEventListener("visibilitychange", onHide);

    return () => {
      observer.disconnect();
      timers.forEach((timer) => window.clearTimeout(timer));
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", onHide);
      flush();
    };
  }, [shareToken, elements, steps]);
}
