import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import {
  mediaFrameClass,
  mediaObjectClass,
  mediaSizes,
} from '../lib/media/responsive-media';
import { auditResponsiveMediaSource } from './helpers/responsive-media-policy';

void test('responsive media exposes explicit modes and bounded size purposes', () => {
  assert.match(mediaFrameClass('cover'), /media-frame/);
  assert.match(mediaObjectClass('cover'), /media-object-cover/);
  assert.match(mediaObjectClass('contain'), /media-object-contain/);
  assert.match(mediaObjectClass('natural'), /media-object-natural/);
  for (const key of [
    'editorial',
    'occasion',
    'productSlider',
    'productGrid',
    'shopGrid',
    'productGallery',
    'galleryThumbnail',
    'savedProduct',
    'cartThumbnail',
    'reviewAttachment',
    'adminThumbnail',
    'brandMark',
    'footerLogo',
    'qr',
    'makerGrid',
    'notFound',
  ] as const) {
    assert.ok(mediaSizes[key].length > 0, `${key} sizes must be defined`);
  }
});

void test('global media safety never forces fill media to automatic height', async () => {
  const css = await readFile(
    new URL('../app/globals.css', import.meta.url),
    'utf8',
  );
  assert.match(css, /:where\(img, video\)[\s\S]*?max-inline-size:\s*100%/);
  assert.doesNotMatch(css, /:where\(img, video\)[\s\S]{0,120}height:\s*auto/);
  assert.match(css, /\.media-object-cover[\s\S]*?object-fit:\s*cover/);
  assert.match(css, /\.media-object-contain[\s\S]*?object-fit:\s*contain/);
  assert.match(css, /\.media-object-natural[\s\S]*?height:\s*auto/);
  assert.match(css, /\.media-shrink[\s\S]*?max-inline-size:\s*100%/);
});

void test('policy rejects every unsupported render shape', () => {
  const invalid = [
    '<Image src="/x.jpg" alt="x" fill />',
    '<img src={url} alt="x" />',
    '<video src={url} controls />',
    '<div style={{ backgroundImage: `url(${preview})` }} />',
  ];
  for (const source of invalid) {
    assert.ok(auditResponsiveMediaSource('fixture.tsx', source).length > 0);
  }
  assert.deepEqual(
    auditResponsiveMediaSource(
      'fixture.tsx',
      '<div data-media-frame="cover" className={mediaFrameClass(\'cover\', \'aspect-square\')}><Image data-media-mode="cover" src="/x.jpg" alt="x" fill sizes="100vw" className={mediaObjectClass(\'cover\')} /></div>',
    ),
    [],
  );
});

void test('a bare frame marker cannot reserve geometry or hide an oversized media width', () => {
  assert.deepEqual(
    auditResponsiveMediaSource(
      'fixture.tsx',
      '<div data-media-frame="cover"><img data-media-mode="cover" className="w-[900px]" src="/test.jpg" /></div>',
    ),
    [
      { file: 'fixture.tsx', line: 1, rule: 'missing-frame' },
      { file: 'fixture.tsx', line: 1, rule: 'unbounded-fixed-width' },
    ],
  );
});

void test('frame markers require an unconditional bounded shared or local frame', () => {
  for (const className of [
    '"rounded-xl"',
    '"relative aspect-square"',
    '"overflow-hidden"',
    '"overflow-hidden aspect-square w-[900px]"',
    "{enabled ? mediaFrameClass('cover', 'aspect-square') : ''}",
    "{cn('aspect-square', enabled && 'overflow-hidden')}",
    "{mediaFrameClass('contain', 'aspect-square')}",
    "{mediaFrameClass('cover', 'w-[900px] aspect-square')}",
  ]) {
    assert.deepEqual(
      auditResponsiveMediaSource(
        'fixture.tsx',
        `<div data-media-frame="cover" className=${className}><img data-media-mode="cover" src="/test.jpg" /></div>`,
      ),
      [{ file: 'fixture.tsx', line: 1, rule: 'missing-frame' }],
      className,
    );
  }
  assert.deepEqual(
    auditResponsiveMediaSource(
      'fixture.tsx',
      '<div data-media-frame="cover" className={mediaFrameClass(\'cover\', \'aspect-square\')}><div data-media-frame="cover"><img data-media-mode="cover" src="/test.jpg" /></div></div>',
    ),
    [{ file: 'fixture.tsx', line: 1, rule: 'missing-frame' }],
  );
});

void test('valid shared, local and self frames keep the media policy contract', () => {
  for (const source of [
    '<div data-media-frame="cover" className={mediaFrameClass(\'cover\', \'aspect-square\')}><Image data-media-mode="cover" fill sizes="100vw" src="/test.jpg" /></div>',
    '<div data-media-frame="cover" className="relative min-w-0 aspect-square overflow-hidden"><img data-media-mode="cover" src="/test.jpg" /></div>',
    '<div data-media-frame="cover" className="size-16 overflow-hidden"><img data-media-mode="cover" src="/test.jpg" /></div>',
    '<div data-media-frame="cover" className={cn(\'overflow-hidden\', enabled ? \'aspect-square\' : \'aspect-video\')}><img data-media-mode="cover" src="/test.jpg" /></div>',
    '<video data-media-frame="contain" data-media-mode="contain" className={mediaObjectClass(\'contain\', \'aspect-video max-h-96\')} src="/test.mp4" />',
    '<div data-media-frame="cover" className={mediaFrameClass(\'cover\', \'aspect-square\')}><img data-media-mode="cover" className="w-[900px]" src="/test.jpg" /></div>',
  ]) {
    assert.deepEqual(
      auditResponsiveMediaSource('fixture.tsx', source),
      [],
      source,
    );
  }
});

void test('policy requires positive numeric intrinsic dimensions', () => {
  for (const source of [
    '<img data-media-mode="natural" src={url} alt="x" width="100%" height="auto" />',
    '<img data-media-mode="natural" src={url} alt="x" width={0} height={0} />',
  ]) {
    assert.deepEqual(auditResponsiveMediaSource('fixture.tsx', source), [
      { file: 'fixture.tsx', line: 1, rule: 'missing-frame' },
    ]);
  }

  assert.deepEqual(
    auditResponsiveMediaSource(
      'fixture.tsx',
      '<img data-media-mode="natural" src={url} alt="x" width={640} height={480} />',
    ),
    [],
  );
});

void test('shared frame helpers require unconditional reserved geometry', () => {
  for (const className of [
    "{mediaFrameClass('cover')}",
    "{mediaFrameClass('cover', enabled ? 'aspect-square' : '')}",
    "{mediaFrameClass('cover', 'sm:aspect-square')}",
  ]) {
    assert.deepEqual(
      auditResponsiveMediaSource(
        'fixture.tsx',
        `<div data-media-frame="cover" className=${className}><Image data-media-mode="cover" fill sizes="100vw" src="/x.jpg" /></div>`,
      ),
      [{ file: 'fixture.tsx', line: 1, rule: 'missing-frame' }],
      className,
    );
  }
  for (const className of [
    "{mediaFrameClass('cover', 'aspect-square')}",
    "{mediaFrameClass('cover', enabled ? 'aspect-square' : 'aspect-video')}",
    "{mediaFrameClass('cover', 'min-h-[clamp(18rem,72vw,29rem)]')}",
  ]) {
    assert.deepEqual(
      auditResponsiveMediaSource(
        'fixture.tsx',
        `<div data-media-frame="cover" className=${className}><Image data-media-mode="cover" fill sizes="100vw" src="/x.jpg" /></div>`,
      ),
      [],
      className,
    );
  }
});

void test('maximum width caps preserve responsive frames without excusing fixed or minimum widths', () => {
  for (const attributes of [
    'className="relative overflow-hidden aspect-square w-full max-w-[900px]"',
    'className="relative overflow-hidden aspect-square w-full [max-inline-size:900px]"',
    'className="relative overflow-hidden aspect-square" style={{width: "100%", maxWidth: 900}}',
    'className="relative overflow-hidden aspect-square" style={{maxInlineSize: "900px"}}',
  ]) {
    assert.deepEqual(
      auditResponsiveMediaSource(
        'fixture.tsx',
        `<div data-media-frame="cover" ${attributes}><Image data-media-mode="cover" fill sizes="100vw" src="/x.jpg" /></div>`,
      ),
      [],
      attributes,
    );
  }
  for (const attributes of [
    'className="overflow-hidden aspect-square w-[900px]"',
    'className="overflow-hidden aspect-square min-w-[900px]"',
    'className="overflow-hidden aspect-square size-[900px]"',
    'className="overflow-hidden aspect-square [min-inline-size:900px]"',
    'className="overflow-hidden aspect-square" style={{width: 900}}',
    'className="overflow-hidden aspect-square" style={{minWidth: "900px"}}',
  ]) {
    assert.deepEqual(
      auditResponsiveMediaSource(
        'fixture.tsx',
        `<div data-media-frame="cover" ${attributes}><Image data-media-mode="cover" fill sizes="100vw" src="/x.jpg" /></div>`,
      ),
      [{ file: 'fixture.tsx', line: 1, rule: 'missing-frame' }],
      attributes,
    );
  }
});

void test('named frame geometry is derived from unconditional stylesheet rules, never a class allowlist', () => {
  const source =
    '<div data-media-frame="cover" className={mediaFrameClass(\'cover\', \'test-frame\')}><Image data-media-mode="cover" fill sizes="100vw" src="/x.jpg" /></div>';
  for (const css of [
    '',
    '.test-frame { color: red; }',
    '@media (min-width: 640px) { .test-frame { height: 200px; } }',
    '.test-frame img { height: 200px; }',
    '.test-frame { position: absolute; inset: 0; }',
  ]) {
    assert.deepEqual(
      auditResponsiveMediaSource('fixture.tsx', source, css),
      [{ file: 'fixture.tsx', line: 1, rule: 'missing-frame' }],
      css,
    );
  }
  for (const css of [
    '.test-frame { aspect-ratio: 4 / 3; }',
    '@layer components { .other, .test-frame { height: clamp(10rem,30vw,20rem); } }',
  ]) {
    assert.deepEqual(
      auditResponsiveMediaSource('fixture.tsx', source, css),
      [],
      css,
    );
  }
});

void test('absolute inset frames depend on the nearest positioned container geometry', () => {
  const frame =
    '<div data-media-frame="cover" className={mediaFrameClass(\'cover\', \'test-frame\')}><Image data-media-mode="cover" fill sizes="100vw" src="/x.jpg" /></div>';
  const css =
    '.test-frame { position:absolute; inset:0; } .container { position:relative; height:200px; }';
  for (const source of [
    frame,
    `<div className="relative">${frame}</div>`,
    `<div className="relative h-64"><div className="relative">${frame}</div></div>`,
  ]) {
    assert.deepEqual(
      auditResponsiveMediaSource('fixture.tsx', source, css),
      [{ file: 'fixture.tsx', line: 1, rule: 'missing-frame' }],
      source,
    );
  }
  for (const source of [
    `<div className="relative h-64">${frame}</div>`,
    `<div className="container">${frame}</div>`,
  ]) {
    assert.deepEqual(
      auditResponsiveMediaSource('fixture.tsx', source, css),
      [],
      source,
    );
  }
});

void test('nested conditional CSS cannot establish base frame geometry', () => {
  const source =
    '<div data-media-frame="cover" className={mediaFrameClass(\'cover\', \'test-frame\')}><Image data-media-mode="cover" fill sizes="100vw" src="/x.jpg" /></div>';
  for (const condition of [
    '@media (min-width:640px)',
    '@supports (display:grid)',
    '@container (min-width:640px)',
  ]) {
    for (const layer of [false, true]) {
      const nested = `.test-frame { ${condition} { color:red; height:200px; } }`;
      const css = layer ? `@layer components { ${nested} }` : nested;
      assert.deepEqual(
        auditResponsiveMediaSource('fixture.tsx', source, css),
        [{ file: 'fixture.tsx', line: 1, rule: 'missing-frame' }],
        css,
      );
      for (const direct of [
        `.test-frame { height:200px; ${condition} { color:red; } }`,
        `.test-frame { ${condition} { color:red; } height:200px; }`,
      ]) {
        assert.deepEqual(
          auditResponsiveMediaSource(
            'fixture.tsx',
            source,
            layer ? `@layer components { ${direct} }` : direct,
          ),
          [],
          direct,
        );
      }
    }
  }
});

void test('CSS geometry does not excuse fixed or minimum widths but permits maximum caps', () => {
  const source =
    '<div data-media-frame="cover" className={mediaFrameClass(\'cover\', \'test-frame\')}><Image data-media-mode="cover" fill sizes="100vw" src="/x.jpg" /></div>';
  for (const property of [
    'width',
    'min-width',
    'inline-size',
    'min-inline-size',
    'size',
  ]) {
    const css = `.test-frame { height:200px; ${property}:900px; }`;
    assert.deepEqual(
      auditResponsiveMediaSource('fixture.tsx', source, css),
      [{ file: 'fixture.tsx', line: 1, rule: 'missing-frame' }],
      css,
    );
  }
  for (const property of ['max-width', 'max-inline-size']) {
    assert.deepEqual(
      auditResponsiveMediaSource(
        'fixture.tsx',
        source,
        `.test-frame { height:200px; width:100%; ${property}:900px; }`,
      ),
      [],
    );
  }
});

void test('policy rejects every oversized arbitrary pixel width form', () => {
  for (const className of ['w-[640px]', 'size-[640px]', '[width:640px]']) {
    assert.deepEqual(
      auditResponsiveMediaSource(
        'fixture.tsx',
        `<img data-media-mode="natural" src={url} alt="x" width={640} height={480} className="${className}" />`,
      ),
      [{ file: 'fixture.tsx', line: 1, rule: 'unbounded-fixed-width' }],
    );
  }
});

void test('policy requires media-shrink to be unconditionally present', () => {
  assert.deepEqual(
    auditResponsiveMediaSource(
      'fixture.tsx',
      '<img data-media-mode="natural" src={url} alt="x" width={640} height={480} className={cn(\'w-[640px]\', enabled && \'media-shrink\')} />',
    ),
    [{ file: 'fixture.tsx', line: 1, rule: 'unbounded-fixed-width' }],
  );
  assert.deepEqual(
    auditResponsiveMediaSource(
      'fixture.tsx',
      '<img data-media-mode="natural" src={url} alt="x" width={640} height={480} className={cn(\'w-[640px]\', \'media-shrink\')} />',
    ),
    [],
  );
});

void test('policy reports exact rules and ignores non-media icon components', () => {
  assert.deepEqual(
    auditResponsiveMediaSource(
      'fixture.tsx',
      '\n<Image src="/x.jpg" alt="x" fill />',
    ),
    [
      { file: 'fixture.tsx', line: 2, rule: 'missing-mode' },
      { file: 'fixture.tsx', line: 2, rule: 'missing-frame' },
      { file: 'fixture.tsx', line: 2, rule: 'fill-image-missing-sizes' },
    ],
  );
  assert.deepEqual(
    auditResponsiveMediaSource(
      'fixture.tsx',
      '<div data-media-frame="cover"><Image data-media-mode="contain" src="/x.jpg" alt="x" fill sizes="100vw" /></div>',
    ),
    [{ file: 'fixture.tsx', line: 1, rule: 'missing-frame' }],
  );
  assert.deepEqual(
    auditResponsiveMediaSource(
      'fixture.tsx',
      '<ImageIcon className="size-[640px]" />',
    ),
    [],
  );
});
