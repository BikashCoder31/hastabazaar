"use client";

import { useEffect, useRef, type ReactNode } from "react";

/** Image-only decoration: its parent frame, copy and controls never transform. */
export function ParallaxImage({
  children,
  kind,
  maxOffset = 16,
  enabled = true,
}: {
  children: ReactNode;
  kind: "hero" | "maker";
  maxOffset?: number;
  enabled?: boolean;
}) {
  const frame = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const element = frame.current;
    if (!element) return;
    element.dataset.parallaxActive = "false";
    if (!enabled || !window.IntersectionObserver) return;

    const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
    let visible = false;
    let listening = false;
    let pending: number | null = null;
    const desktopLimit = Number.isFinite(maxOffset)
      ? Math.min(16, Math.max(0, maxOffset))
      : 0;
    const canAnimate = () =>
      visible && !motion.matches && document.visibilityState !== "hidden";

    function paint() {
      pending = null;
      if (!canAnimate()) return;
      const { top, height } = element!.getBoundingClientRect();
      const viewport = window.innerHeight;
      if (height <= 0 || viewport <= 0) return;
      const progress = Math.max(
        0,
        Math.min(1, (viewport - top) / (viewport + height)),
      );
      const limit =
        window.innerWidth < 768 ? Math.min(8, desktopLimit) : desktopLimit;
      element!.style.setProperty(
        "--parallax-offset",
        `${((progress * 2 - 1) * limit).toFixed(2)}px`,
      );
      element!.dataset.parallaxActive = "true";
    }
    function schedule() {
      if (pending === null && canAnimate())
        pending = window.requestAnimationFrame(paint);
    }
    function stop() {
      if (pending !== null) window.cancelAnimationFrame(pending);
      pending = null;
      window.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", schedule);
      listening = false;
      element!.style.removeProperty("--parallax-offset");
      element!.dataset.parallaxActive = "false";
    }
    function sync() {
      if (!canAnimate()) {
        stop();
        return;
      }
      if (!listening) {
        window.addEventListener("scroll", schedule, { passive: true });
        window.addEventListener("resize", schedule, { passive: true });
        listening = true;
      }
      schedule();
    }
    const observer = new IntersectionObserver((entries) => {
      visible = entries[0]?.isIntersecting ?? false;
      sync();
    });
    observer.observe(element);
    motion.addEventListener("change", sync);
    document.addEventListener("visibilitychange", sync);
    return () => {
      observer.disconnect();
      motion.removeEventListener("change", sync);
      document.removeEventListener("visibilitychange", sync);
      stop();
    };
  }, [enabled, maxOffset]);

  return (
    <div
      ref={frame}
      data-homepage-parallax={kind}
      className="homepage-parallax-frame"
    >
      <div className="homepage-parallax-image">{children}</div>
    </div>
  );
}
