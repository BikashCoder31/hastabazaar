/** Reachable card snap positions; cards at the trailing edge share one dot. */
export function productSliderPositions(
  offsets: readonly number[],
  scrollWidth: number,
  viewportWidth: number,
): number[] {
  const maximum = Math.max(0, scrollWidth - viewportWidth);
  if (maximum <= 1 || !offsets.length) return [];
  const positions: number[] = [];
  for (const offset of offsets) {
    const position = Math.max(0, Math.min(offset, maximum));
    if (!positions.length || position - positions[positions.length - 1] > 1) {
      positions.push(position);
    }
  }
  return positions;
}

export function activeProductSliderPosition(
  positions: readonly number[],
  scrollLeft: number,
): number {
  let closest = 0;
  for (let index = 1; index < positions.length; index++) {
    if (
      Math.abs(positions[index] - scrollLeft) <
      Math.abs(positions[closest] - scrollLeft)
    )
      closest = index;
  }
  return closest;
}
