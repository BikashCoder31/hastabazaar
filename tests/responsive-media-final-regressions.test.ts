import assert from 'node:assert/strict';
import test from 'node:test';
import { auditResponsiveMediaSource } from './helpers/responsive-media-policy';

const audit = (source: string, css = '') =>
  auditResponsiveMediaSource('fixture.tsx', source, css);
const missingFrame = [{ file: 'fixture.tsx', line: 1, rule: 'missing-frame' }];

void test('fill media validates intervening containing blocks inside the marked frame', () => {
  for (const media of [
    '<Image data-media-mode="cover" fill sizes="100vw" src="/x.jpg" />',
    '<img data-media-mode="cover" className="absolute inset-0 object-cover" src="/x.jpg" />',
    '<img data-media-mode="cover" className="floating object-cover" src="/x.jpg" />',
    '<img data-media-mode="cover" className="object-cover" style={{["position"]: "absolute"}} src="/x.jpg" />',
    '<img data-media-mode="cover" className="object-cover" style={{position: active ? "absolute" : "static"}} src="/x.jpg" />',
  ]) {
    const wrap = (inner: string) =>
      `<div data-media-frame="cover" className={mediaFrameClass('cover', 'aspect-square')}><div className="${inner}">${media}</div></div>`;
    const css = '.floating {position:absolute; width:100%; height:100%}';
    assert.deepEqual(audit(wrap('relative'), css), missingFrame, media);
    assert.deepEqual(audit(wrap('relative h-48'), css), [], media);
    assert.deepEqual(audit(wrap('static'), css), [], media);
  }
});

void test('fit contracts remain unconditional through CSS, aliases and natural dimensions', () => {
  const natural =
    '<img data-media-mode="natural" width={640} height={480} className="w-full h-full" />';
  assert.ok(audit(natural).some((v) => v.rule === 'invalid-fit'));
  const source =
    '<div data-media-frame="contain" className={mediaFrameClass("contain", "aspect-square")}><img data-media-mode="contain" className="fitting" /></div>';
  assert.ok(
    audit(
      source,
      '@media (min-width:640px){.fitting {object-fit:contain}}',
    ).some((v) => v.rule === 'invalid-fit'),
  );
  assert.deepEqual(
    audit(
      source,
      '.fitting {object-fit:contain} @media (min-width:640px){.fitting {object-fit:contain}}',
    ),
    [],
  );
  assert.ok(
    audit(
      source,
      '.fitting {object-fit:contain} @media (min-width:640px){.fitting {object-fit:cover}}',
    ).some((v) => v.rule === 'invalid-fit'),
  );
  for (const mode of ['contain', 'cover'] as const) {
    const source = `const fit = mediaObjectClass('${mode}'); const node = <div data-media-frame="contain" className={mediaFrameClass('contain', 'aspect-square')}><img data-media-mode="contain" className={fit} /></div>`;
    assert.equal(audit(source).length, mode === 'contain' ? 0 : 1);
  }
  assert.deepEqual(
    audit(
      '<img data-media-mode="natural" width={640} height={480} className="w-full h-auto" />',
    ),
    [],
  );
  assert.ok(
    audit(
      'const fit = fit; const node = <img data-media-mode="contain" width={640} height={480} className={fit} />',
    ).some((v) => v.rule === 'invalid-fit'),
  );
  assert.ok(
    audit(
      'const fit = mediaObjectClass("contain"); function View(fit) {return <img data-media-mode="contain" width={640} height={480} className={fit} />}',
    ).some((v) => v.rule === 'invalid-fit'),
  );
});

void test('collapsing CSS geometry survives importance, layers and conditional overrides', () => {
  const source =
    '<div data-media-frame="cover" className={mediaFrameClass("cover", "aspect-square")}><div className="inner"><Image data-media-mode="cover" fill sizes="100vw" src="/x.jpg" /></div></div>';
  for (const css of [
    '.inner {position:relative; height:0!important} .inner {height:12rem}',
    '.inner {position:relative; height:0} @layer components {.inner {height:12rem}}',
    '.inner {position:relative; height:12rem} @media (min-width:640px) {.inner {height:0}}',
    '.inner {position:relative; height:12rem; &:hover {height:0}}',
  ])
    assert.deepEqual(audit(source, css), missingFrame, css);
  for (const css of [
    '.inner {position:relative; height:12rem!important} .inner {height:16rem}',
    '.inner {position:relative; height:12rem} @layer components {.inner {height:16rem}}',
    '.inner {position:relative; height:12rem} @media (min-width:640px) {.inner {height:16rem}}',
    '.inner {position:relative; height:12rem!important}',
  ])
    assert.deepEqual(audit(source, css), [], css);
});

for (const marked of [false, true]) {
  void test(`collapsing inset ${marked ? 'marked frame' : 'intervening wrapper'} cannot borrow outer geometry`, () => {
    const media = [
      '<Image data-media-mode="cover" fill sizes="100vw" src="/x.jpg" />',
      // In-flow media isolates frameMarker's inset fallback from the separate
      // out-of-flow containing-block check exercised by the fill image.
      ...(marked
        ? [
            '<img data-media-mode="cover" className="w-full h-full object-cover" src="/x.jpg" />',
          ]
        : []),
    ];
    for (const child of media) {
      const source = `<div data-media-frame="cover" className={mediaFrameClass('cover', 'aspect-square')}><div ${marked ? 'data-media-frame="cover"' : ''} className="inner overflow-hidden">${child}</div></div>`;
      assert.deepEqual(
        audit(
          source,
          '.inner {position:absolute; inset:0; max-height:0!important}',
        ),
        missingFrame,
      );
      for (const css of [
        '.inner {position:absolute; inset:0}',
        '.inner {position:absolute; inset:0; max-height:12rem!important}',
      ])
        assert.deepEqual(audit(source, css), [], css);
    }
  });
}

void test('declared fit rejects operative contradictions and requires a matching contract', () => {
  const frame = (mode: string, media: string) =>
    `<div data-media-frame="${mode}" className={mediaFrameClass('${mode}', 'aspect-square')}>${media}</div>`;
  for (const [mode, media] of [
    [
      'contain',
      '<img data-media-mode="contain" className="w-full h-full object-cover" />',
    ],
    [
      'cover',
      '<img data-media-mode="cover" className="w-full h-full object-contain" />',
    ],
    ['contain', '<img data-media-mode="contain" className="w-full h-full" />'],
    [
      'contain',
      '<Image data-media-mode="contain" fill sizes="100vw" className={mediaObjectClass("contain")} />',
    ],
    [
      'contain',
      '<img data-media-mode="contain" className={mediaObjectClass("contain", "object-cover")} />',
    ],
    [
      'contain',
      '<img data-media-mode="contain" className={mediaObjectClass("contain")} style={{objectFit:"cover"}} />',
    ],
    [
      'contain',
      '<img data-media-mode="contain" className={mediaObjectClass("contain")} style={{objectFit: active ? "contain" : "cover"}} />',
    ],
    [
      'natural',
      '<img data-media-mode="natural" width={640} height={480} className="w-full h-full object-cover" />',
    ],
  ]) {
    assert.ok(
      audit(frame(mode!, media!)).some((v) => v.rule === 'invalid-fit'),
      media,
    );
  }
  for (const [mode, media] of [
    [
      'contain',
      '<img data-media-mode="contain" className="w-full h-full object-contain" />',
    ],
    [
      'cover',
      '<img data-media-mode="cover" className={mediaObjectClass("cover")} />',
    ],
    [
      'contain',
      '<Image data-media-mode="contain" fill sizes="100vw" style={{objectFit:"contain"}} className={mediaObjectClass("contain")} />',
    ],
    ['cover', '<Image data-media-mode="cover" fill sizes="100vw" />'],
    [
      'natural',
      '<img data-media-mode="natural" width={640} height={480} className={mediaObjectClass("natural")} />',
    ],
  ])
    assert.deepEqual(audit(frame(mode!, media!)), [], media);
});
