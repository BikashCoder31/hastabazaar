import assert from 'node:assert/strict';
import test from 'node:test';
import { PDFDocument, PDFName, PDFString } from 'pdf-lib';
import { deflateSync } from 'node:zlib';
import { sharp } from '../lib/reviews/image-processor';
import { validateSellerDocumentContent } from '../lib/documents/document-content';
import { validateEvidenceContent } from '../lib/documents/document-content';

const validators = [validateSellerDocumentContent, validateEvidenceContent];
const pdfFile = (bytes: Uint8Array) =>
  new File([new Uint8Array(bytes)], 'document.pdf', {
    type: 'application/pdf',
  });
async function document() {
  const doc = await PDFDocument.create();
  doc.addPage([300, 400]).drawText('Fictional certificate');
  return doc;
}

function addTaggedLayout(doc: PDFDocument) {
  const attributes = doc.context.obj({
    O: 'Layout',
    Placement: 'Block',
    SpaceBefore: 10,
    TextAlign: 'Center',
  });
  const root = doc.context.obj({ Type: 'StructTreeRoot' });
  const rootRef = doc.context.register(root);
  const element = doc.context.obj({
    Type: 'StructElem',
    S: 'Document',
    P: rootRef,
    A: attributes,
  });
  root.set(PDFName.of('K'), doc.context.register(element));
  doc.catalog.set(PDFName.of('StructTreeRoot'), rootRef);
  doc.catalog.set(PDFName.of('MarkInfo'), doc.context.obj({ Marked: true }));
  return attributes;
}
void test('certificate and evidence reject signature-only images and malformed PDF documents', async () => {
  const files = [
    new File(['%PDF-not-a-document'], 'fake.pdf', { type: 'application/pdf' }),
    new File([new Uint8Array([255, 216, 255]), 'invalid image'], 'fake.jpg', {
      type: 'image/jpeg',
    }),
    new File([new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10])], 'fake.png', {
      type: 'image/png',
    }),
  ];
  for (const validate of validators)
    for (const file of files)
      assert.ok(await validate(file), `${validate.name}: ${file.name}`);
});
void test('evidence content must match its declared MIME type', async () => {
  const pdf = await (await document()).save();
  const png = new Uint8Array(
    await sharp({
      create: { width: 8, height: 8, channels: 3, background: '#abcdef' },
    })
      .png()
      .toBuffer(),
  );
  for (const validate of validators) {
    assert.ok(
      await validate(
        new File([new Uint8Array(pdf)], 'fake.png', { type: 'image/png' }),
      ),
    );
    assert.ok(
      await validate(new File([png], 'fake.pdf', { type: 'application/pdf' })),
    );
    assert.ok(
      await validate(new File([png], 'fake.jpg', { type: 'image/jpeg' })),
    );
  }
});
void test('passive real PDFs and decoded raster evidence remain accepted', async () => {
  for (const useObjectStreams of [false]) {
    const file = pdfFile(await (await document()).save({ useObjectStreams }));
    for (const validate of validators) assert.equal(await validate(file), null);
  }
  for (const format of ['jpeg', 'png'] as const) {
    const bytes = new Uint8Array(
      await sharp({
        create: { width: 8, height: 8, channels: 3, background: '#abcdef' },
      })
        [format]()
        .toBuffer(),
    );
    for (const validate of validators)
      assert.equal(
        await validate(
          new File([bytes], `valid.${format}`, { type: `image/${format}` }),
        ),
        null,
      );
  }
});

void test('tagged PDF layout attributes and a local initial view are accepted', async () => {
  const doc = await document();
  addTaggedLayout(doc);
  doc.catalog.set(
    PDFName.of('OpenAction'),
    doc.context.obj([doc.getPages()[0].ref, 'XYZ', null, null, 0.75]),
  );
  const file = pdfFile(await doc.save({ useObjectStreams: false }));
  for (const validate of validators) assert.equal(await validate(file), null);
});

void test('only recognized passive PDF layout attributes are allowed', async () => {
  const unsupportedLayout = await document();
  addTaggedLayout(unsupportedLayout).set(
    PDFName.of('Unexpected'),
    PDFString.of('test'),
  );

  const outsideTag = await document();
  const attributes = outsideTag.context.obj({ O: 'Layout', Placement: 'Block' });
  outsideTag.getPages()[0].node.set(PDFName.of('A'), attributes);

  const unlinkedTag = await document();
  unlinkedTag.context.register(unlinkedTag.context.obj({
    Type: 'StructElem', A: { O: 'Layout', Placement: 'Block' },
  }));

  const unmatchedName = await document();
  addTaggedLayout(unmatchedName);
  unmatchedName.catalog.set(PDFName.of('Lang'), PDFString.of('test /A'));

  for (const doc of [unsupportedLayout, outsideTag, unlinkedTag, unmatchedName]) {
    const file = pdfFile(await doc.save({ useObjectStreams: false }));
    for (const validate of validators) assert.ok(await validate(file));
  }
});

void test('initial PDF view requires a local page from the document page tree', async () => {
  const doc = await document();
  const detachedPage = doc.context.register(doc.context.obj({ Type: 'Page' }));
  doc.catalog.set(
    PDFName.of('OpenAction'),
    doc.context.obj([detachedPage, 'XYZ', null, null, 0.75]),
  );
  const file = pdfFile(await doc.save({ useObjectStreams: false }));
  for (const validate of validators) assert.ok(await validate(file));
});
void test('a discarded opening-view name prevents PDF acceptance', async () => {
  const doc = await document();
  doc.catalog.set(
    PDFName.of('OpenAction'),
    doc.context.obj([doc.getPages()[0].ref, 'XYZ', null, null, 0.75]),
  );
  doc.catalog.set(PDFName.of('Lang'), PDFString.of('test /OpenAction'));
  const file = pdfFile(await doc.save({ useObjectStreams: false }));
  for (const validate of validators) assert.ok(await validate(file));
});

void test('compressed PDF object streams are rejected before their payload can expand', async () => {
  const normalCompressed = pdfFile(await (await document()).save());
  const doc = await document();
  doc.context.register(
    doc.context.stream(deflateSync(Buffer.alloc(4 * 1024 * 1024, 32)), {
      Type: 'ObjStm',
      N: 0,
      First: 0,
      Filter: 'FlateDecode',
    }),
  );
  const bomb = await doc.save({ useObjectStreams: false });
  assert.ok(bomb.length < 10_000);
  const escaped = new TextEncoder().encode(
    new TextDecoder('latin1').decode(bomb).replace('/ObjStm', '/#4fbjStm'),
  );
  for (const file of [normalCompressed, pdfFile(bomb), pdfFile(escaped)])
    for (const validate of validators) assert.ok(await validate(file));
});
void test('PDF actions, embedded attachments, forms and encryption are rejected', async () => {
  const active = await document();
  active.addJavaScript('run', 'app.alert("test")');
  const attachment = await document();
  await attachment.attach(new Uint8Array([1, 2, 3]), 'attachment.bin');
  const action = await document();
  action.catalog.set(
    PDFName.of('OpenAction'),
    action.context.obj({ S: 'URI', URI: PDFString.of('https://example.test') }),
  );
  const form = await document();
  form.getForm().createTextField('name').addToPage(form.getPages()[0]);
  const encrypted = await document();
  encrypted.context.trailerInfo.Encrypt = encrypted.context.register(
    encrypted.context.obj({ Filter: 'Standard', V: 1, R: 2 }),
  );
  for (const doc of [active, attachment, action, form, encrypted]) {
    const file = pdfFile(await doc.save({ useObjectStreams: false }));
    for (const validate of validators)
      assert.ok(await validate(file), validate.name);
  }
});
void test('PDF active catalog cannot hide behind a duplicate object ignored by its xref table', async () => {
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R /OpenAction << /S /JavaScript /JS (app.alert\\(1\\)) >> >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 300 400] >>',
  ];
  let body = '%PDF-1.4\n';
  const offsets: number[] = [];
  for (const [index, object] of objects.entries()) {
    offsets.push(body.length);
    body += `${index + 1} 0 obj\n${object}\nendobj\n`;
  }
  // pdf-lib's sequential parser keeps this last definition. A reader resolving
  // the xref below instead sees the FIRST catalog, with its active OpenAction.
  body += '1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n';
  const xref = body.length;
  body += `xref\n0 4\n0000000000 65535 f \n${offsets
    .map((offset) => String(offset).padStart(10, '0') + ' 00000 n \n')
    .join('')}`;
  body += `trailer\n<< /Size 4 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  const file = pdfFile(new TextEncoder().encode(body));
  for (const validate of validators)
    assert.ok(await validate(file), validate.name);
});

void test('PDF content streams cannot load external files', async () => {
  const doc = await document();
  const external = doc.context.register(
    doc.context.stream(new Uint8Array(), {
      F: PDFString.of('https://external.invalid/content'),
    }),
  );
  doc.getPages()[0].node.set(PDFName.of('Contents'), external);
  const file = pdfFile(await doc.save({ useObjectStreams: false }));
  for (const validate of validators)
    assert.ok(await validate(file), validate.name);
});

void test('cyclic page trees and excessive page counts fail without recursive traversal', async () => {
  const cyclic = await document();
  const pagesRef = cyclic.catalog.get(PDFName.of('Pages'))!;
  const pages = cyclic.catalog.lookup(
    PDFName.of('Pages'),
  ) as import('pdf-lib').PDFDict;
  pages.set(PDFName.of('Kids'), cyclic.context.obj([pagesRef]));
  const many = await document();
  for (let i = 0; i < 100; i++) many.addPage([300, 400]);
  for (const doc of [cyclic, many])
    for (const validate of validators)
      assert.ok(
        await validate(pdfFile(await doc.save({ useObjectStreams: false }))),
      );
});
