export function shuffle(items, random = Math.random) {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}
export function overlap(a, b) {
  const counts = new Map();
  for (const char of a) counts.set(char, (counts.get(char) || 0) + 1);
  let total = 0;
  for (const char of b) if (counts.get(char)) {
    total++; counts.set(char, counts.get(char) - 1);
  }
  return total;
}
function countsOf(chars) {
  const counts = new Map();
  for (const c of chars) counts.set(c, (counts.get(c) || 0) + 1);
  return counts;
}
// Search all useful extra-character multisets (at most five extra tiles).
// Maximize total source coverage, then prefer missing characters in the last three positions.
export function chooseExtras(answer, lines, count, random = Math.random) {
  const base = countsOf(answer);
  const targets = lines.map(countsOf);
  if (lines.some(line => overlap(answer, line) === line.length)) return null;
  const needs = new Map();
  for (const target of targets) for (const [c, n] of target) {
    needs.set(c, Math.max(needs.get(c) || 0, n - (base.get(c) || 0)));
  }
  const dimensions = [...needs].filter(([, n]) => n > 0);
  const board = new Map(base);
  let best, bestCoverage = -1, bestTail = -1, ties = 0;
  const extras = [];
  function visit(index) {
    if (index === dimensions.length) {
      let coverage = 0, tail = 0;
      for (let i = 0; i < lines.length; i++) {
        let missing = 0;
        const suffix = countsOf(lines[i].slice(-3));
        for (const [c, n] of targets[i]) {
          const deficit = Math.max(0, n - (board.get(c) || 0));
          missing += deficit;
          tail += Math.min(deficit, suffix.get(c) || 0);
        }
        if (!missing) return;
        coverage += lines[i].length - missing;
      }
      if (coverage > bestCoverage || (coverage === bestCoverage && tail > bestTail)) {
        bestCoverage = coverage; bestTail = tail; ties = 0;
      } else if (coverage !== bestCoverage || tail !== bestTail) return;
      if (random() < 1 / ++ties) best = [...extras];
      return;
    }
    const [c, need] = dimensions[index];
    const limit = Math.min(need, count - extras.length);
    for (let n = 0; n <= limit; n++) {
      board.set(c, (base.get(c) || 0) + n);
      visit(index + 1);
      extras.push(c);
    }
    extras.length -= limit + 1;
    board.set(c, base.get(c) || 0);
  }
  visit(0);
  if (!best) return null;
  // Once maximum useful coverage is reached, fill remaining slots safely.
  // Repeated/common characters here are padding, not mistaken for added coverage.
  const alphabet = [...new Set([...answer, ...lines.join('')])];
  while (best.length < count) {
    const safe = shuffle(alphabet, random).filter(c => lines.every(line => overlap([...answer, ...best, c], line) < line.length));
    const current = countsOf([...answer, ...best]);
    safe.sort((a, b) => (current.get(a) || 0) - (current.get(b) || 0));
    if (!safe.length) return null;
    best.push(safe[0]);
  }
  return best;
}
export const TIER_WEIGHTS = { basic: 45, normal: 45, advanced: 10 };
export function pickPoem(poems, random = Math.random, previousId) {
  const tiers = Object.entries(TIER_WEIGHTS).filter(([tier]) => poems.some(p => (p.tier || 'basic') === tier));
  let draw = random() * tiers.reduce((sum, [, weight]) => sum + weight, 0);
  let tier = tiers.at(-1)?.[0];
  for (const [name, weight] of tiers) { draw -= weight; if (draw < 0) { tier = name; break; } }
  const pool = poems.filter(p => (p.tier || 'basic') === tier);
  const previousAuthor = poems.find(p => p.id === previousId)?.author;
  const differentAuthors = pool.filter(p => p.author !== previousAuthor);
  const choices = differentAuthors.length ? differentAuthors : pool.filter(p => p.id !== previousId);
  return choices[Math.floor(random() * choices.length)] || pool[0];
}
export function makeQuestion(poems, random = Math.random, previousId) {
  const poem = pickPoem(poems, random, previousId);
  if (!poem?.lines?.length) throw new Error('诗词题库为空');
  const answer = poem.lines[Math.floor(random() * poem.lines.length)];
  const extraCount = answer.length === 5 ? 4 : 5;
  // Each other poem contributes its most overlapping line; randomize ties.
  const candidates = shuffle(poems.filter(p => p.id !== poem.id), random).map(p => {
    const lines = shuffle(p.lines.filter(line => line !== answer && line.length === answer.length && overlap(answer, line) < line.length), random);
    lines.sort((a, b) => overlap(answer, b) - overlap(answer, a));
    return { poem: p, line: lines[0], score: overlap(answer, lines[0] || '') };
  }).filter(p => p.line).sort((a, b) => b.score - a.score);
  if (!candidates.length) throw new Error('没有足够的干扰诗句');
  const sources = candidates.slice(0, random() < .5 ? 1 : 2);
  const extras = chooseExtras(answer, sources.map(source => source.line), extraCount, random);
  if (!extras) throw new Error('无法生成不完整覆盖干扰诗句的字块');
  return { poemId: poem.id, tier: poem.tier || 'basic', answer, title: poem.title, author: poem.author,
    tiles: shuffle([...answer, ...extras], random),
    sources: sources.map(s => ({ title: s.poem.title, author: s.poem.author, line: s.line })) };
}
export function validAnswers(poems, tiles, length) {
  return poems.flatMap(poem => poem.lines.filter(line => line.length === length && overlap(line, tiles) === length)
    .map(line => ({ line, title: poem.title, author: poem.author })));
}
