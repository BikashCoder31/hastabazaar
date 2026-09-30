'use client';

import type { KeyboardEvent } from 'react';

export function SliderDots({
  labels,
  current,
  label,
  onSelect,
  className = '',
  dotClassName = '',
  appearance = 'dark',
}: {
  labels: readonly string[];
  current: number;
  label: string;
  onSelect: (index: number) => void;
  className?: string;
  dotClassName?: string;
  appearance?: 'dark' | 'light';
}) {
  if (labels.length < 2) return null;
  const focusClass =
    appearance === 'light'
      ? 'focus-visible:outline-[#f2ebe1]'
      : 'focus-visible:outline-[#0d3154]';
  const activeClass =
    appearance === 'light'
      ? 'size-2.5 rounded-full bg-[#f2ebe1] shadow-[0_0_0_3px_rgba(242,235,225,0.15)]'
      : 'size-2.5 rounded-full bg-[#0d3154] shadow-[0_0_0_3px_rgba(13,49,84,0.1)]';
  const inactiveClass =
    appearance === 'light'
      ? 'size-2 rounded-full bg-[#9aaec2] transition-colors group-hover:bg-[#f2ebe1]'
      : 'size-2 rounded-full bg-[#73869a] transition-colors group-hover:bg-[#0d3154]';

  function navigate(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    let destination: number;
    if (event.key === 'ArrowLeft')
      destination = (index + labels.length - 1) % labels.length;
    else if (event.key === 'ArrowRight')
      destination = (index + 1) % labels.length;
    else if (event.key === 'Home') destination = 0;
    else if (event.key === 'End') destination = labels.length - 1;
    else return;
    event.preventDefault();
    event.stopPropagation();
    onSelect(destination);
    event.currentTarget.parentElement
      ?.querySelectorAll<HTMLButtonElement>('button')
      [destination]?.focus();
  }

  return (
    <div
      data-slider-dots
      role="group"
      aria-label={label}
      className={`relative flex w-full flex-wrap items-center justify-center ${className}`}
    >
      {labels.map((destination, index) => (
        <button
          key={`${index}:${destination}`}
          type="button"
          aria-label={destination}
          aria-current={index === current ? 'true' : undefined}
          onClick={() => onSelect(index)}
          onKeyDown={(event) => navigate(event, index)}
          className={`group grid size-11 shrink-0 place-items-center rounded-full focus-visible:outline-2 focus-visible:outline-offset-1 ${focusClass} ${dotClassName}`}
        >
          <span
            aria-hidden="true"
            className={index === current ? activeClass : inactiveClass}
          />
        </button>
      ))}
    </div>
  );
}
