/** Graduations « rondes » de 0 à au moins `max`, en `count` intervalles. */
export function niceTicks(max: number, count = 3): number[] {
  if (max <= 0) return [0, 1];
  const rough = max / count;
  const magnitude = 10 ** Math.floor(Math.log10(rough));
  const unit = [1, 2, 2.5, 5, 10].map((m) => m * magnitude).find((candidate) => candidate >= rough) ?? rough;
  return Array.from({ length: count + 1 }, (_, index) => Number((index * unit).toFixed(10)));
}
