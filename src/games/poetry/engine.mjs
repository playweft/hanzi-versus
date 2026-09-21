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
// Maximize coverage in source order; weight equal solutions toward later missing positions.
export function chooseExtras(answer, lines, count, random = Math.random, pad = true, fixed = []) {
  const base = countsOf([...answer, ...fixed]);
  const targets = lines.map(countsOf);
  if (lines.some(line => overlap([...answer, ...fixed], line) === line.length)) return null;
  const needs = new Map();
  for (const target of targets) for (const [c, n] of target) {
    needs.set(c, Math.max(needs.get(c) || 0, n - (base.get(c) || 0)));
  }
  const dimensions = [...needs].filter(([, n]) => n > 0);
  const board = new Map(base);
  let best, bestScore, totalWeight = 0;
  const extras = [...fixed];
  function visit(index) {
    if (index === dimensions.length) {
      const score = [];
      let weight = 1;
      for (let i = 0; i < lines.length; i++) {
        let missing = 0;
        for (const [c, n] of targets[i]) {
          const deficit = Math.max(0, n - (board.get(c) || 0));
          missing += deficit;
          if (deficit) {
            // Sum weights of all indistinguishable positional omissions for repeated characters.
            const ways = Array(deficit + 1).fill(0); ways[0] = 1;
            [...lines[i]].forEach((char, position) => {
              if (char === c) for (let k = deficit; k > 0; k--) ways[k] += ways[k - 1] * 2 ** position;
            });
            weight *= ways[deficit];
          }
        }
        if (!missing) return;
        score.push(lines[i].length - missing);
      }
      const difference = bestScore ? score.findIndex((value, i) => value !== bestScore[i]) : -1;
      if (!bestScore || (difference >= 0 && score[difference] > bestScore[difference])) {
        bestScore = score; totalWeight = 0;
      } else if (difference >= 0) return;
      totalWeight += weight;
      if (random() < weight / totalWeight) best = [...extras];
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
  if (!pad) return best;
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
// Try another source before spending leftover slots on zero-coverage padding.
export function selectDistractors(answer, candidates, count, random = Math.random) {
  const first = candidates[0];
  if (!first) throw new Error('没有足够的干扰诗句');
  let sources = [first];
  let useful = chooseExtras(answer, sources.map(s => s.line), count, random, false);
  if (!useful) throw new Error('无法生成干扰字');
  const primaryCoverage = overlap(first.line, [...answer, ...useful]);
  const primaryExtras = [...useful];
  if (useful.length < count) {
    // Candidates are ordered by overlap; preserve the strongest source and
    // prefer the first pair that can use every extra slot meaningfully.
    for (const candidate of candidates.slice(1)) {
      if (candidate.line === first.line || candidate.poem?.id === first.poem?.id) continue;
      const pair = [first, candidate];
      const trial = chooseExtras(answer, pair.map(s => s.line), count, random, false, primaryExtras);
      if (trial && overlap(first.line, [...answer, ...trial]) === primaryCoverage
          && trial.length > useful.length) { sources = pair; useful = trial; }
      if (useful.length === count) break;
    }
  }
  const extras = useful.length === count ? useful
    : chooseExtras(answer, sources.map(s => s.line), count, random, true, useful);
  if (!extras) throw new Error('无法生成不完整覆盖干扰诗句的字块');
  return { sources, extras };
}
export const TIER_WEIGHTS = { basic: 35, normal: 55, advanced: 10 };
export const POEM_WEIGHT_CAP = 4;
// Drawing a poem uniformly would hit a one-line poem's only line four times as
// often as any line of a four-line poem. Weight by line count up to the cap:
// below it every line of every poem is equally likely, at or above it every poem
// is. The two rules meet at the cap, so the weight never jumps.
export function poemWeight(poem) {
  return Math.min(poem.lines?.length || 1, POEM_WEIGHT_CAP);
}
export function pickPoem(poems, random = Math.random, previousId) {
  const tiers = Object.entries(TIER_WEIGHTS).filter(([tier]) => poems.some(p => (p.tier || 'basic') === tier));
  let draw = random() * tiers.reduce((sum, [, weight]) => sum + weight, 0);
  let tier = tiers.at(-1)?.[0];
  for (const [name, weight] of tiers) { draw -= weight; if (draw < 0) { tier = name; break; } }
  const pool = poems.filter(p => (p.tier || 'basic') === tier);
  const previousAuthor = poems.find(p => p.id === previousId)?.author;
  const differentAuthors = pool.filter(p => p.author !== previousAuthor);
  const choices = differentAuthors.length ? differentAuthors : pool.filter(p => p.id !== previousId);
  if (!choices.length) return pool[0];
  // Exactly one draw, so callers that inject `random` keep the same stream shape.
  let pick = random() * choices.reduce((sum, poem) => sum + poemWeight(poem), 0);
  for (const poem of choices) { pick -= poemWeight(poem); if (pick < 0) return poem; }
  return choices.at(-1);
}
// School tiers proxy familiarity. Every tied line remains eligible (weights 4:2:1).
export const FAMILIARITY_WEIGHTS = { basic: 4, normal: 2, advanced: 1 };
export function canDistract(target, candidate) {
  return (FAMILIARITY_WEIGHTS[candidate.tier] ?? 1) >= (FAMILIARITY_WEIGHTS[target.tier] ?? 1);
}
export function rankDistractors(candidates, random = Math.random) {
  return candidates.map(candidate => ({ candidate,
    key: -Math.log(Math.max(Number.MIN_VALUE, 1 - random()))
      / (FAMILIARITY_WEIGHTS[candidate.poem.tier] ?? 1)
  })).sort((a, b) => b.candidate.score - a.candidate.score || a.key - b.key)
    .map(item => item.candidate);
}
export function makeQuestion(poems, random = Math.random, previousId) {
  const poem = pickPoem(poems, random, previousId);
  if (!poem?.lines?.length) throw new Error('诗词题库为空');
  const answer = poem.lines[Math.floor(random() * poem.lines.length)];
  const extraCount = answer.length === 5 ? 4 : 5;
  // Rank all eligible lines, so each tied line receives its own weighted chance.
  const candidates = rankDistractors(poems.filter(p => p.id !== poem.id && canDistract(poem, p)).flatMap(p =>
    p.lines.filter(line => line.length === answer.length && overlap(answer, line) < line.length)
      .map(line => ({ poem: p, line, score: overlap(answer, line) }))
  ), random);
  if (!candidates.length) throw new Error('没有足够的干扰诗句');
  const { sources, extras } = selectDistractors(answer, candidates, extraCount, random);
  return { poemId: poem.id, tier: poem.tier || 'basic', answer, title: poem.title, author: poem.author,
    tiles: shuffle([...answer, ...extras], random),
    sources: sources.map(s => ({ title: s.poem.title, author: s.poem.author, line: s.line })) };
}
export function validAnswers(poems, tiles, length) {
  return poems.flatMap(poem => poem.lines.filter(line => line.length === length && overlap(line, tiles) === length)
    .map(line => ({ line, title: poem.title, author: poem.author })));
}

// Membership only, not position correctness; consume repeated letters once each.
export function guessMembership(answer, guess) {
  const remaining = countsOf(answer);
  return [...guess].map(char => {
    const present = (remaining.get(char) || 0) > 0;
    if (present) remaining.set(char, remaining.get(char) - 1);
    return present;
  });
}
