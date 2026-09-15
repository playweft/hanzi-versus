import { clean, extractHint } from "./engine.mjs";

// Caller supplies AI transport; generation failure never invents a clue.
export async function generateIdiomHint(answer, hints, guesses, round, { request, debug = false } = {}) {
  const transcript = guesses.length
    ? guesses.map((item) => `第${item.round}轮猜测：${item.guess}`).join("；")
    : "无";
  const prompt = [
    "你是中文成语游戏的线索设计师。",
    `答案成语：${answer}。`,
    `已有提示：${hints.join("、") || "无"}。`,
    `此前双方猜测：${transcript}。`,
    "先分析成语含义、禁用字与候选提示，再选择语义最贴切者。",
    "最后必须另起一行输出“最终提示：XX”，其中 XX 恰好两个汉字、不含答案中的任何字。",
  ].join("\n");
  const compactRetryPrompt = [
    `答案成语：${answer}。禁用答案中的任何汉字。`,
    "上一轮回答没有完成最终提示。请用极简思考后立刻完成输出。",
    "只输出两行：分析：不超过100字；最终提示：XX。XX 必须恰好两个汉字，且与答案无重字。",
  ].join("\n");
  const debugAi = debug;
  if (debugAi) console.info("[Hanzi Versus] AI prompt", { prompt, round });
  if (!request) throw new Error("尚未连接 AI 服务，请连接后重试。");
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const rawReply = await request({
        input: attempt === 0 ? prompt : compactRetryPrompt,
      });
      if (debugAi) console.info("[Hanzi Versus] AI response", rawReply);
      const reply = clean(rawReply);
      const candidate = extractHint(reply, answer);
      if (candidate) return candidate;
    } catch (error) {
      if (debugAi) console.error("[Hanzi Versus] AI request failed", error);
    }
  }
  throw new Error("提示生成失败，请重试。本次未增加提示。");
}

