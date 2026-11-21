'use client';

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type FocusEvent,
  type KeyboardEvent,
  type PointerEvent,
} from 'react';
import type { CarouselApi } from '@/components/ui/carousel';

function playbackControl(target: EventTarget) {
  return target instanceof Element && target.closest('[data-autoplay-toggle]') !== null;
}

/** Rotates homepage stories with a separate hold after manual browsing. */
export function createSliderAutoplay(
  advance: () => void,
  { delayMs = 6_000, manualHoldMs = delayMs, onSchedule }: {
    delayMs?: number;
    manualHoldMs?: number;
    onSchedule?: (duration: number) => void;
  } = {},
) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  let paused = false;
  let disposed = false;
  let holdUntil = 0;
  function reschedule() {
    if (timer !== undefined) clearTimeout(timer);
    timer = undefined;
    if (paused || disposed) return;
    const duration = Math.max(delayMs, holdUntil - Date.now());
    timer = setTimeout(() => {
      timer = undefined;
      advance();
      reschedule();
    }, duration);
    onSchedule?.(duration);
  }
  function reset() {
    holdUntil = Date.now() + manualHoldMs;
    reschedule();
  }
  reschedule();
  return {
    reset,
    reschedule,
    setPaused(value: boolean) {
      if (paused === value) return;
      paused = value;
      reschedule();
    },
    dispose() {
      disposed = true;
      reschedule();
    },
  };
}

export function useSliderAutoplay(
  api: CarouselApi,
  count: number,
  videoPlaying = false,
  { delayMs = 6_000, manualHoldMs = delayMs, pauseOnPointerFocus = true, trackProgress = false }: {
    delayMs?: number;
    manualHoldMs?: number;
    pauseOnPointerFocus?: boolean;
    trackProgress?: boolean;
  } = {},
) {
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const [hidden, setHidden] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(false);
  const [pausedByUser, setPausedByUser] = useState(false);
  const [progress, setProgress] = useState({ cycle: 0, duration: delayMs });
  const timer = useRef<ReturnType<typeof createSliderAutoplay> | null>(null);
  const automaticSelection = useRef(true);
  const paused = pausedByUser || hovered || focused || hidden || reducedMotion || videoPlaying;
  const pausedRef = useRef(paused);
  const toggleUserPause = useCallback(() => {
    setFocused(false);
    setPausedByUser(value => !value);
  }, []);

  const reset = useCallback(() => {
    automaticSelection.current = false;
    timer.current?.reset();
  }, []);
  const selectionKind = useCallback(() => {
    const kind = automaticSelection.current ? 'automatic' : 'manual';
    automaticSelection.current = false;
    return kind;
  }, []);

  useEffect(() => {
    pausedRef.current = paused;
    timer.current?.setPaused(paused);
  }, [paused]);

  useEffect(() => {
    const preference = window.matchMedia('(prefers-reduced-motion: reduce)');
    const updateMotion = () => setReducedMotion(preference.matches);
    const updateVisibility = () =>
      setHidden(document.visibilityState === 'hidden');
    updateMotion();
    updateVisibility();
    preference.addEventListener('change', updateMotion);
    document.addEventListener('visibilitychange', updateVisibility);
    return () => {
      preference.removeEventListener('change', updateMotion);
      document.removeEventListener('visibilitychange', updateVisibility);
    };
  }, []);

  useEffect(() => {
    if (!api || count < 2) return;
    const controller = createSliderAutoplay(() => {
      automaticSelection.current = true;
      api.scrollNext();
    }, {
      delayMs,
      manualHoldMs,
      onSchedule: trackProgress ? duration => {
        setProgress(current => ({ cycle: current.cycle + 1, duration }));
      } : undefined,
    });
    timer.current = controller;
    controller.setPaused(pausedRef.current);
    api.on('pointerDown', reset);
    if (!pauseOnPointerFocus) api.on('pointerUp', reset);
    api.on('select', controller.reschedule);
    api.on('reInit', controller.reschedule);
    return () => {
      controller.dispose();
      timer.current = null;
      api.off('pointerDown', reset);
      if (!pauseOnPointerFocus) api.off('pointerUp', reset);
      api.off('select', controller.reschedule);
      api.off('reInit', controller.reschedule);
    };
  }, [api, count, delayMs, manualHoldMs, pauseOnPointerFocus, reset, trackProgress]);

  const resetAfterBrowse = (event: { target: EventTarget }) => {
    if (!playbackControl(event.target)) reset();
  };
  const pointerInteraction = (event: { target: EventTarget }) => {
    setFocused(false);
    resetAfterBrowse(event);
  };

  return {
    reset,
    selectionKind,
    paused,
    pausedByUser,
    progress,
    toggleUserPause,
    interactionProps: {
      onPointerEnter: (event: PointerEvent<HTMLElement>) => {
        if (event.pointerType !== 'touch') setHovered(true);
      },
      onPointerLeave: () => setHovered(false),
      onPointerDownCapture: pauseOnPointerFocus ? undefined : pointerInteraction,
      onPointerUpCapture: pauseOnPointerFocus ? undefined : resetAfterBrowse,
      onTouchStartCapture: pauseOnPointerFocus ? undefined : pointerInteraction,
      onTouchEndCapture: pauseOnPointerFocus ? undefined : resetAfterBrowse,
      onClickCapture: pauseOnPointerFocus ? undefined : resetAfterBrowse,
      onKeyDownCapture: pauseOnPointerFocus ? undefined : (event: KeyboardEvent<HTMLElement>) => {
        if (event.currentTarget.contains(document.activeElement)) setFocused(true);
      },
      onFocusCapture: (event: FocusEvent<HTMLElement>) =>
        setFocused(pauseOnPointerFocus || event.target.matches(':focus-visible')),
      onBlurCapture: (event: FocusEvent<HTMLElement>) => {
        if (!event.currentTarget.contains(event.relatedTarget)) {
          setFocused(false);
        }
      },
    },
  };
}
