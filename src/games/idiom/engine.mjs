// Idiom bank and validation rules, independent of the page and host bridge.
const HAN_2 = /^[\u3400-\u9fff]{2}$/u;
export const HAN_4 = /^[\u3400-\u9fff]{4}$/u;
let idioms = [];

export async function loadIdioms() {
  if (idioms.length) return idioms;
  const response = await fetch("./data/idioms_top4500.txt");
  if (!response.ok) throw new Error("题库加载失败");
  idioms = (await response.text())
    .split(/\r?\n/)
    .map((line) => line.split("\t")[0])
    .filter((word) => HAN_4.test(word));
  if (!idioms.length) throw new Error("题库为空");
  return idioms;
}

export function clean(value) {
  return String(value ?? "")
    .trim()
    .replace(/\s/g, "");
}
export function isValidHint(hint, answer) {
  return (
    HAN_2.test(hint) &&
    [...hint].every((character) => ![...answer].includes(character))
  );
}
export function extractHint(reply, answer) {
  const labeled = [
    ...reply.matchAll(/(?:最终提示|提示)\s*[：:]\s*([\u3400-\u9fff]{2})/gu),
  ].map((match) => match[1]);
  return labeled.reverse().find((value) => isValidHint(value, answer));
}

