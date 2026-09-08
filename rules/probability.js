export function weightedChoice(items, score, rng) {
  const weights = items.map((item) => Math.max(0.001, score(item)));
  let cursor = rng() * weights.reduce((sum, weight) => sum + weight, 0);
  for (let index = 0; index < items.length; index += 1) {
    cursor -= weights[index];
    if (cursor <= 0) return items[index];
  }
  return items.at(-1);
}

export function maxWithRandomTie(items, score, rng) {
  let highest = -Infinity;
  let tied = [];
  for (const item of items) {
    const value = score(item);
    if (value > highest + 1e-9) {
      highest = value;
      tied = [item];
    } else if (Math.abs(value - highest) < 1e-9) tied.push(item);
  }
  return tied[Math.floor(rng() * tied.length)];
}

