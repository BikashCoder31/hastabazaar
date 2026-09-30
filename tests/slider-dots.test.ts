import assert from 'node:assert/strict';
import test from 'node:test';
import { renderToStaticMarkup } from 'react-dom/server';
import type { ReactElement, KeyboardEvent } from 'react';

type DotButton = ReactElement<{
  onClick: () => void;
  onKeyDown: (event: KeyboardEvent<HTMLButtonElement>) => void;
}>;
type DotsComponent = (props: {
  labels: readonly string[];
  current: number;
  label: string;
  appearance?: 'dark' | 'light';
  onSelect: (index: number) => void;
}) => ReactElement<{ children: DotButton[] }> | null;

async function loadDots() {
  const path = '../components/ui/slider-dots';
  const sliderModule = (await import(path).catch(() => null)) as {
    SliderDots: DotsComponent;
  } | null;
  assert.ok(sliderModule, 'shared dot controls must be available');
  return sliderModule.SliderDots;
}

void test('dot controls expose each destination and the active story; no control is shown for one destination', async () => {
  const SliderDots = await loadDots();
  const props = {
    labels: ['Show first story', 'Show second story'],
    current: 1,
    label: 'Choose featured story',
    onSelect: () => undefined,
  };
  const markup = renderToStaticMarkup(SliderDots(props));
  assert.match(markup, /role="group"/);
  assert.match(markup, /data-slider-dots/);
  assert.match(markup, /aria-label="Choose featured story"/);
  assert.equal((markup.match(/<button/g) ?? []).length, 2);
  assert.match(markup, /aria-label="Show second story" aria-current="true"/);
  assert.equal(SliderDots({ ...props, labels: ['Only story'] }), null);
});

void test('dot clicks choose the matching story and arrow keys wrap focus and selection together', async () => {
  const SliderDots = await loadDots();
  const selected: number[] = [];
  const focused: number[] = [];
  const dots = SliderDots({
    labels: ['First', 'Second', 'Third'],
    current: 0,
    label: 'Choose story',
    onSelect: (index) => selected.push(index),
  });
  assert.ok(dots);
  dots.props.children[1].props.onClick();
  const event = {
    key: 'ArrowLeft',
    preventDefault() {},
    stopPropagation() {},
    currentTarget: {
      parentElement: {
        querySelectorAll: () =>
          [0, 1, 2].map((index) => ({ focus: () => focused.push(index) })),
      },
    },
  } as unknown as KeyboardEvent<HTMLButtonElement>;
  dots.props.children[0].props.onKeyDown(event);
  assert.deepEqual(selected, [1, 2]);
  assert.deepEqual(focused, [2]);
});

void test('product dots correspond to reachable snap positions, coalescing cards at the scroll boundary', async () => {
  const path = '../lib/catalog/product-slider-position';
  const sliderModule = (await import(path).catch(() => null)) as null | {
    productSliderPositions: (
      offsets: readonly number[],
      width: number,
      viewport: number,
    ) => number[];
    activeProductSliderPosition: (
      positions: readonly number[],
      left: number,
    ) => number;
  };
  assert.ok(sliderModule, 'product scroll geometry must be available');
  assert.deepEqual(
    sliderModule.productSliderPositions([0, 320, 640, 960], 1260, 400),
    [0, 320, 640, 860],
  );
  assert.deepEqual(
    sliderModule.productSliderPositions([0, 320, 640, 960], 1260, 800),
    [0, 320, 460],
  );
  assert.deepEqual(
    sliderModule.productSliderPositions([0, 320, 640, 960], 1260, 1300),
    [],
  );
  assert.equal(sliderModule.activeProductSliderPosition([0, 320, 460], 450), 2);
  assert.equal(sliderModule.activeProductSliderPosition([0, 320, 460], 140), 0);
  assert.equal(sliderModule.activeProductSliderPosition([0, 320, 460], 200), 1);
});

void test('light dots and their focus ring remain visible on navy while distinguishing the active story', async () => {
  const SliderDots = await loadDots();
  const markup = renderToStaticMarkup(
    SliderDots({
      labels: ['First', 'Second'],
      current: 1,
      label: 'Choose gifting story',
      appearance: 'light',
      onSelect: () => undefined,
    }),
  );
  const buttons = markup.match(/<button\b[^>]*>[\s\S]*?<\/button>/g) ?? [];
  assert.equal(buttons.length, 2);
  function luminance(hex: string) {
    const channels = [1, 3, 5]
      .map((index) => parseInt(hex.slice(index, index + 2), 16) / 255)
      .map((channel) =>
        channel <= 0.04045
          ? channel / 12.92
          : ((channel + 0.055) / 1.055) ** 2.4,
      );
    return channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722;
  }
  const navy = luminance('#102f54');
  const dotLuminance = buttons.map((button) => {
    const spanClass = button.match(/<span[^>]*class="([^"]*)"/)?.[1] ?? '';
    const color = spanClass.match(/(?:^|\s)bg-\[(#[0-9a-f]{6})\]/)?.[1];
    assert.ok(color);
    const light = luminance(color);
    assert.ok(
      (light + 0.05) / (navy + 0.05) >= 3,
      'each dot must contrast with the navy section',
    );
    const focus = button.match(/focus-visible:outline-\[(#[0-9a-f]{6})\]/)?.[1];
    assert.ok(focus);
    assert.ok(
      (luminance(focus) + 0.05) / (navy + 0.05) >= 3,
      'keyboard focus must contrast with the navy section',
    );
    return light;
  });
  assert.doesNotMatch(buttons[0], /aria-current/);
  assert.match(buttons[1], /aria-current="true"/);
  assert.ok(
    dotLuminance[1] > dotLuminance[0],
    'active story must be brighter than inactive stories',
  );
});
