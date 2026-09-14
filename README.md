# Hanzi Versus / 汉字对决

一个可运行在 Playweft 的成语猜谜游戏。玩家根据 AI 生成的二字提示，抢答隐藏的四字成语。

## 模式

- **单人**：每题最多获得六条 AI 提示；每次答错后进入下一条提示。
- **双人房间**：两人同时看到相同提示，并有 20 秒首轮抢答时间。
  - 第一位错误猜测会开启 **0.8 秒竞态窗口**。
  - 另一位若在窗口内同时提交了不同错误答案，本轮直接结束。
  - 否则另一位获得 **8 秒延时猜测**；猜错或超时则进入下一条提示。
  - 同一成语最多六条提示；仍无人答对则公开答案并换题。

## AI 提示

游戏使用 Playweft 的 `languageModel.prompt`。房主在每一轮生成提示时，平台会在首次请求时询问其是否允许使用自己已连接的 Cloudflare Workers AI 账户。提示请求包含：当前成语、已有提示和双方历史猜测，要求仅返回一个不与答案重字的二字词语。

AI 不可用、未连接 Cloudflare 或未授权时，游戏会使用本地兜底提示以保持流程可玩。

## Playweft 包

```text
playweft.json  Manifest（单人 + 两人房间）
index.html     界面
app.js         Playweft bridge、AI 提示与单人逻辑
game.lua       双人房间的权威状态机
data/          THUOCL 四字成语题库
```

## 本地开发与部署

```sh
npm install
npm run dev
npm run build
```

Vite 将 `public/` 中的 `playweft.json`、`game.lua`、`data/` 和图标原样复制到构建产物 `dist/`。Cloudflare Workers 的构建命令设为 `npm run build`，部署命令设为 `npx wrangler deploy`。

与 `playweft-extras` 一致，设置 `BASE_PATH=/hanzi-versus/` 可部署到子路径；未设置时默认为 `/`。
此时完整游戏包会输出到 `dist/hanzi-versus/`，包括 `playweft.json`。

## 目前的公平性边界

Playweft v1 的 `languageModel.prompt` 只能由 iframe 发起，Lua 房间状态机不能直接把隐藏答案交给模型。因此双人模式由房主的客户端取得隐藏答案并请求 AI，再把提示提交给 Lua；其他玩家不会收到答案，但房主理论上可以通过浏览器调试工具看到它。

这适合好友娱乐对战。正式排位需要 Playweft 增加一个服务端能力：由 Lua 仅提交受限的“生成线索”请求，平台在不暴露答案的前提下调用模型并把结果写回权威状态。
