export function inlineFileDisposition(originalName: string): string {
  // Normalize malformed UTF-16 before percent encoding, and bound header size.
  const unicode = new TextDecoder().decode(
    new TextEncoder().encode(originalName),
  );
  const name =
    Array.from(unicode)
      .slice(0, 200)
      .map((character) =>
        character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127 ||
        ['"', '\\', '/'].includes(character) ? '_' : character,
      )
      .join('') || 'download';
  const fallback = name.replace(/[^\x20-\x7e]/g, '_');
  const encoded = encodeURIComponent(name).replace(
    /['()*]/g,
    (character) => '%' + character.charCodeAt(0).toString(16).toUpperCase(),
  );
  return `inline; filename="${fallback}"; filename*=UTF-8''${encoded}`;
}
