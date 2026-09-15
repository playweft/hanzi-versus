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
// Remove from the last three positions first, keeping duplicate tiles distinct.
export function trimLine(line, count, random = Math.random) {
  const chars = [...line];
  const indices = chars.map((_, i) => i);
  const removal = [...shuffle(indices.slice(-3), random), ...shuffle(indices.slice(0, -3), random)];
  const removed = new Set(removal.slice(0, chars.length - count));
  return chars.filter((_, i) => !removed.has(i));
}
export function makeQuestion(poems, random = Math.random, previousId) {
  const choices = poems.filter(p => p.id !== previousId);
  const poem = choices[Math.floor(random() * choices.length)] || poems[0];
  if (!poem?.lines?.length) throw new Error('诗词题库为空');
  const answer = poem.lines[Math.floor(random() * poem.lines.length)];
  const extraCount = answer.length === 5 ? 4 : 5;
  // Each other poem contributes its most overlapping line; randomize ties.
  const candidates = shuffle(poems.filter(p => p.id !== poem.id), random).map(p => {
    const lines = shuffle(p.lines.filter(line => line !== answer && line.length === answer.length), random);
    lines.sort((a, b) => overlap(answer, b) - overlap(answer, a));
    return { poem: p, line: lines[0], score: overlap(answer, lines[0] || '') };
  }).filter(p => p.line).sort((a, b) => b.score - a.score);
  if (!candidates.length) throw new Error('没有足够的干扰诗句');
  const sources = candidates.slice(0, random() < .5 ? 1 : 2);
  const extras = sources.flatMap((source, i) => trimLine(source.line,
    sources.length === 1 ? extraCount : i === 0 ? Math.ceil(extraCount / 2) : Math.floor(extraCount / 2), random));
  return { poemId: poem.id, answer, title: poem.title, author: poem.author,
    tiles: shuffle([...answer, ...extras], random),
    sources: sources.map(s => ({ title: s.poem.title, author: s.poem.author, line: s.line })) };
}
export function validAnswers(poems, tiles, length) {
  return poems.flatMap(poem => poem.lines.filter(line => line.length === length && overlap(line, tiles) === length)
    .map(line => ({ line, title: poem.title, author: poem.author })));
}
