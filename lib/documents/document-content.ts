import {
  validateProductImage,
  validateProductImageContent,
} from '../products/submission';
// oxlint-disable no-control-regex -- PDF token boundaries explicitly include NUL and ASCII whitespace.
const forbidden = new Set([
  'A',
  'F',
  'AA',
  'OpenAction',
  'JS',
  'JavaScript',
  'Launch',
  'EmbeddedFiles',
  'EmbeddedFile',
  'Filespec',
  'EF',
  'RichMedia',
  'RichMediaContent',
  'XFA',
  'AcroForm',
  'SubmitForm',
  'ImportData',
  'Rendition',
  'Movie',
  'Sound',
  '3D',
  'GoToR',
  'GoToE',
]);

const layoutTextAlignments = new Set(['Start', 'Center', 'End', 'Justify']);

const invalidPdf =
  'Use a valid, unencrypted PDF with 1–100 pages. Export a plain PDF without forms, scripts, actions or attachments.';
const complexPdf =
  'This PDF uses unsupported compression or is too complex. Use Print to PDF to create a plain copy, or upload JPG/PNG images instead.';

export const validateSellerDocumentContent = (file: File) =>
  validateDocumentContent(file);
export const validateEvidenceContent = (file: File) =>
  validateDocumentContent(file, true);

/** Private evidence is retained byte-for-byte. This validates structure, not malware signatures. */
export async function validateDocumentContent(
  file: File,
  allowWebp = false,
): Promise<string | null> {
  if (!file.size || file.size > 5 * 1024 * 1024)
    return 'Each file must contain data and be 5 MB or smaller.';
  if (file.type !== 'application/pdf') {
    if (
      ![
        'image/jpeg',
        'image/png',
        ...(allowWebp ? ['image/webp'] : []),
      ].includes(file.type)
    )
      return 'Use a supported image or PDF file.';
    return (
      validateProductImage(file) ?? (await validateProductImageContent(file))
    );
  }
  try {
    const bytes = new Uint8Array(await file.arrayBuffer());
    // A complete PDF needs its header, cross-reference location and final marker.
    const text = new TextDecoder('latin1').decode(bytes);
    // pdf-lib expands object/xref streams before exposing objects to callers.
    // Reject those formats BEFORE parsing, including escaped or indirect Type names.
    // This intentionally scans names inside comments/strings too (conservative).
    let layoutAttributeNames = 0;
    let initialViewNames = 0;
    for (const match of text.matchAll(/\/([^\x00\t\n\f\r ()<>[\]{}/%]+)/g)) {
      const name = match[1].replace(/#([a-fA-F0-9]{2})/g, (_, hex: string) =>
        String.fromCharCode(parseInt(hex, 16)),
      );
      if (name === 'ObjStm' || name === 'XRef') return complexPdf;
      if (name === 'A') layoutAttributeNames++;
      else if (name === 'OpenAction') initialViewNames++;
      else if (forbidden.has(name)) return invalidPdf;
    }
    // Bound parser allocation/work even for densely packed uncompressed objects.
    // Count raw tokens including stream payloads; complex documents fail closed.
    let tokens = 0;
    for (const _ of text.matchAll(
      /[^\x00\t\n\f\r ()<>[\]{}/%]+|[()<>[\]{}/%]/g,
    )) {
      if (++tokens > 150_000) return complexPdf;
    }
    const end = /startxref\s+(\d+)\s+%%EOF\s*$/.exec(text);
    const offset = end ? Number(end[1]) : -1;
    if (
      !/^%PDF-(?:1\.[0-7]|2\.0)\b/.test(text) ||
      !Number.isSafeInteger(offset) ||
      offset < 0 ||
      offset >= bytes.length ||
      !/^xref\b/.test(text.slice(offset))
    )
      return invalidPdf;
    const {
      PDFDocument,
      PDFDict,
      PDFArray,
      PDFRawStream,
      PDFName,
      PDFRef,
      PDFNumber,
      PDFNull,
    } = await import('pdf-lib');
    const doc = await PDFDocument.load(bytes, {
      ignoreEncryption: false,
      throwOnInvalidObject: true,
      updateMetadata: false,
    });
    if (doc.isEncrypted) return invalidPdf;
    const isFiniteNumber = (value: unknown) =>
      value instanceof PDFNumber && Number.isFinite(value.asNumber());
    function isPassiveLayoutAttributes(value: unknown) {
      return (
        value instanceof PDFDict &&
        value.get(PDFName.of('O')) === PDFName.of('Layout') &&
        value.entries().every(([key, setting]) => {
          switch (key.decodeText()) {
            case 'O':
              return true;
            case 'Placement':
              return setting === PDFName.of('Block');
            case 'SpaceBefore':
              return isFiniteNumber(setting);
            case 'TextAlign':
              return (
                setting instanceof PDFName &&
                layoutTextAlignments.has(setting.decodeText())
              );
            default:
              return false;
          }
        })
      );
    }
    const objects = doc.context.enumerateIndirectObjects();
    if (objects.length > 10_000) return invalidPdf;
    const typeKey = PDFName.of('Type');
    const structureElements = new Set<unknown>();
    if (layoutAttributeNames) {
      const tree = doc.catalog.lookup(PDFName.of('StructTreeRoot'));
      if (!(tree instanceof PDFDict) || tree.get(typeKey) !== PDFName.of('StructTreeRoot'))
        return invalidPdf;
      const childrenKey = PDFName.of('K');
      const elementType = PDFName.of('StructElem');
      const children: unknown[] = [tree.get(childrenKey)];
      const seen = new Set<unknown>();
      let traversed = 0;
      while (children.length) {
        if (++traversed > 100_000) return invalidPdf;
        const child = children.pop();
        const node = child instanceof PDFRef ? doc.context.lookup(child) : child;
        if (seen.has(node)) continue;
        seen.add(node);
        if (node instanceof PDFArray) {
          for (const item of node.asArray()) children.push(item);
        } else if (node instanceof PDFDict && node.get(typeKey) === elementType) {
          structureElements.add(node);
          children.push(node.get(childrenKey));
        }
      }
    }
    const pending: Array<{ value: unknown; depth: number }> = objects.map(
      ([, value]) => ({ value, depth: 0 }),
    );
    let visited = 0;
    let initialViewPage: import('pdf-lib').PDFRef | undefined;
    while (pending.length) {
      const { value, depth } = pending.pop()!;
      if (++visited > 100_000 || depth > 64) return invalidPdf;
      if (value instanceof PDFName && forbidden.has(value.decodeText()))
        return invalidPdf;
      if (value instanceof PDFRef && !doc.context.lookup(value))
        return invalidPdf;
      if (value instanceof PDFRawStream)
        pending.push({ value: value.dict, depth: depth + 1 });
      else if (value instanceof PDFDict)
        for (const [key, entry] of value.entries()) {
          const name = key.decodeText();
          if (name === 'A') {
            if (
              --layoutAttributeNames < 0 ||
              !structureElements.has(value) ||
              !isPassiveLayoutAttributes(entry)
            )
              return invalidPdf;
          } else if (name === 'OpenAction') {
            if (
              --initialViewNames < 0 ||
              value !== doc.catalog ||
              value.get(typeKey) !== PDFName.of('Catalog') ||
              !(entry instanceof PDFArray) ||
              entry.size() !== 5
            )
              return invalidPdf;
            const page = entry.get(0);
            const coordinates = entry.asArray().slice(2);
            if (
              !(page instanceof PDFRef) ||
              entry.get(1) !== PDFName.of('XYZ') ||
              !coordinates.every(
                (coordinate) => coordinate === PDFNull || isFiniteNumber(coordinate),
              )
            )
              return invalidPdf;
            initialViewPage = page;
          } else if (forbidden.has(name)) return invalidPdf;
          pending.push({ value: entry, depth: depth + 1 });
        }
      else if (value instanceof PDFArray)
        for (const entry of value.asArray())
          pending.push({ value: entry, depth: depth + 1 });
    }
    // The parser may discard duplicate objects or keys. Every raw occurrence
    // must have been accounted for by one of the passive forms above.
    if (layoutAttributeNames || initialViewNames) return invalidPdf;
    // Walk the page tree ourselves: malformed cyclic Kids must not recurse forever.
    const pages: unknown[] = [doc.catalog.get(PDFName.of('Pages'))];
    const seen = new Set<unknown>();
    let count = 0;
    let initialViewPageFound = false;
    while (pages.length) {
      const entry = pages.pop();
      const page = entry instanceof PDFRef ? doc.context.lookup(entry) : entry;
      if (!(page instanceof PDFDict) || seen.has(page) || seen.size >= 1000)
        return invalidPdf;
      seen.add(page);
      const kind = page.get(PDFName.of('Type'));
      if (!(kind instanceof PDFName)) return invalidPdf;
      if (kind.decodeText() === 'Pages') {
        const kids = page.lookup(PDFName.of('Kids'));
        if (!(kids instanceof PDFArray) || !kids.size() || kids.size() > 1000)
          return invalidPdf;
        pages.push(...kids.asArray());
      } else if (kind.decodeText() === 'Page') {
        if (++count > 100) return invalidPdf;
        if (entry === initialViewPage) initialViewPageFound = true;
        const box = page.get(PDFName.of('MediaBox'));
        if (box) {
          const dimensions =
            box instanceof PDFRef ? doc.context.lookup(box) : box;
          if (
            !(dimensions instanceof PDFArray) ||
            dimensions.size() !== 4 ||
            !dimensions.asArray().every(isFiniteNumber)
          )
            return invalidPdf;
        }
      } else return invalidPdf;
    }
    return count && (!initialViewPage || initialViewPageFound)
      ? null
      : invalidPdf;
  } catch {
    return invalidPdf;
  }
}
