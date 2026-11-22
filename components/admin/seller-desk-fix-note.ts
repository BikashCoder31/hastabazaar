/** Keep the reviewer's own wording when changing the checklist. */
export function toggleSellerDeskFix(marked: readonly string[], note: string, sentence: string) {
  if (marked.includes(sentence)) {
    return {
      marked: marked.filter(item => item !== sentence),
      note: note.split('\n').filter(line => line !== sentence).join('\n').trim(),
    };
  }
  return { marked: [...marked, sentence], note: [note.trim(), sentence].filter(Boolean).join('\n') };
}
