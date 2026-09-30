'use client';

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type FocusEvent,
  type PointerEvent,
} from 'react';
import type { CarouselApi } from '@/components/ui/carousel';

/** One shared interval for both homepage story sliders. */
export function createSliderAutoplay(advance: () => void) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  let paused = false;
  let disposed = false;
  function reset() {
    if (timer !== undefined) clearTimeout(timer);
    timer = undefined;
    if (paused || disposed) return;
    timer = setTimeout(() => {
      timer = undefined;
      advance();
      reset();
    }, 6_000);
  }
  reset();
  return {
    reset,
    setPaused(value: boolean) {
      paused = value;
      reset();
    },
    dispose() {
      disposed = true;
      reset();
    },
  };
}

export function useSliderAutoplay(
  api: CarouselApi,
  count: number,
  videoPlaying = false,
) {
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const [hidden, setHidden] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(false);
  const [pausedByUser, setPausedByUser] = useState(false);
  const timer = useRef<ReturnType<typeof createSliderAutoplay> | null>(null);
  const automaticSelection = useRef(true);
  const paused = pausedByUser || hovered || focused || hidden || reducedMotion || videoPlaying;
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
    });
    timer.current = controller;
    controller.setPaused(paused);
    api.on('pointerDown', reset);
    api.on('select', controller.reset);
    api.on('reInit', controller.reset);
    return () => {
      controller.dispose();
      timer.current = null;
      api.off('pointerDown', reset);
      api.off('select', controller.reset);
      api.off('reInit', controller.reset);
    };
  }, [api, count, paused, reset]);

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
      onFocusCapture: () => setFocused(true),
      onBlurCapture: (event: FocusEvent<HTMLElement>) => {
        if (!event.currentTarget.contains(event.relatedTarget))
          setFocused(false);
      },
    },
  };
}
