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

/** Homepage story sliders rotate every six seconds and can opt into a longer manual hold. */
export function createSliderAutoplay(
  advance: () => void,
  { manualHoldMs = 6_000 }: { manualHoldMs?: number } = {},
) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  let paused = false;
  let disposed = false;
  let holdUntil = 0;
  function reschedule() {
    if (timer !== undefined) clearTimeout(timer);
    timer = undefined;
    if (paused || disposed) return;
    timer = setTimeout(() => {
      timer = undefined;
      advance();
      reschedule();
    }, Math.max(6_000, holdUntil - Date.now()));
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
  { manualHoldMs = 6_000, pauseOnPointerFocus = true }: {
    manualHoldMs?: number;
    pauseOnPointerFocus?: boolean;
  } = {},
) {
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const [hidden, setHidden] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(false);
  const [pausedByUser, setPausedByUser] = useState(false);
  const timer = useRef<ReturnType<typeof createSliderAutoplay> | null>(null);
  const automaticSelection = useRef(true);
  const paused = pausedByUser || hovered || focused || hidden || reducedMotion || videoPlaying;
  const pausedRef = useRef(paused);
  const toggleUserPause = useCallback(() => setPausedByUser(value => !value), []);

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
    }, { manualHoldMs });
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
  }, [api, count, manualHoldMs, pauseOnPointerFocus, reset]);

  const pointerInteraction = () => {
    setFocused(false);
    reset();
  };

  return {
    reset,
    selectionKind,
    pausedByUser,
    toggleUserPause,
    interactionProps: {
      onPointerEnter: (event: PointerEvent<HTMLElement>) => {
        if (event.pointerType !== 'touch') setHovered(true);
      },
      onPointerLeave: () => setHovered(false),
      onPointerDownCapture: pauseOnPointerFocus ? undefined : pointerInteraction,
      onPointerUpCapture: pauseOnPointerFocus ? undefined : reset,
      onTouchStartCapture: pauseOnPointerFocus ? undefined : pointerInteraction,
      onTouchEndCapture: pauseOnPointerFocus ? undefined : reset,
      onClickCapture: pauseOnPointerFocus ? undefined : reset,
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
