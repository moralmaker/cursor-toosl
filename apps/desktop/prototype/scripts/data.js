window.DATA = (function () {
  const vendors = {
    Anthropic: { letter: "A", tint: "#E8A27A" },
    OpenAI: { letter: "O", tint: "#6EA8FE" },
    DeepSeek: { icon: "../src/shared/assets/provider-icons/deepseek.svg" },
    智谱: { icon: "../src/shared/assets/provider-icons/zhipu.svg" },
    Kimi: { icon: "../src/shared/assets/provider-icons/kimi.svg" },
    MiniMax: { icon: "../src/shared/assets/provider-icons/minimax.svg" },
    火山: { icon: "../src/shared/assets/provider-icons/huoshan.png" },
    Google: { letter: "G", tint: "#7C8CFF" },
    Qwen: { letter: "Q", tint: "#F5B94A" },
    Mistral: { letter: "M", tint: "#F26D6D" },
  };
  const models = [
    ["Claude Sonnet 4", "claude-sonnet-4", "Anthropic", "Messages", "api.anthropic.com", "Anthropic"],
    ["Claude Opus 4", "claude-opus-4", "Anthropic", "Messages", "api.anthropic.com", "Anthropic"],
    ["GPT-5.2", "gpt-5.2", "OpenAI", "Responses", "api.openai.com", "OpenAI"],
    ["o3", "o3", "OpenAI", "Responses", "api.openai.com", "OpenAI"],
    ["DeepSeek V3.2", "deepseek-v3.2", "OpenAI", "Chat", "api.deepseek.com", "DeepSeek"],
    ["DeepSeek R1", "deepseek-reasoner", "OpenAI", "Chat", "api.deepseek.com", "DeepSeek"],
    ["Gemini 2.5 Pro", "gemini-2.5-pro", "OpenAI", "Chat", "generativelanguage.googleapis.com", "Google"],
    ["Gemini 2.5 Flash", "gemini-2.5-flash", "OpenAI", "Chat", "generativelanguage.googleapis.com", "Google"],
    ["Qwen3 Max", "qwen3-max", "OpenAI", "Chat", "dashscope.aliyuncs.com", "Qwen"],
    ["Kimi K2", "kimi-k2", "OpenAI", "Chat", "api.moonshot.cn", "Kimi"],
    ["GLM-4.5", "glm-4.5", "OpenAI", "Chat", "open.bigmodel.cn", "智谱"],
    ["MiniMax M2", "MiniMax-M2", "Anthropic", "Messages", "api.minimaxi.com", "MiniMax"],
    ["方舟 Coding", "ark-code-latest", "OpenAI", "Chat", "ark.cn-beijing.volces.com", "火山"],
    ["Mistral Large", "mistral-large", "OpenAI", "Chat", "api.mistral.ai", "Mistral"],
  ].map((row, i) => ({
    hash: "m" + (i + 1),
    name: row[0],
    modelId: row[1],
    type: row[2],
    protocol: row[3],
    host: row[4],
    vendor: row[5],
    brand: vendors[row[5]],
    test: i % 7 === 0 ? "fail" : i % 5 === 0 ? "idle" : "ok",
    speed: 28 + ((i * 17) % 40),
    ttft: 280 + ((i * 53) % 400),
    error: "429 rate_limit",
  }));

  const calls = Array.from({ length: 24 }, (_, i) => {
    const model = models[i % models.length];
    const failed = i === 7 || i === 19;
    const input = 1200 + i * 180;
    const output = 80 + i * 24;
    const cache = Math.round(input * 0.72);
    return {
      id: "call_" + (2400 + i),
      status: failed ? "failed" : "completed",
      name: model.name,
      time: "08:" + String(12 + Math.floor(i / 2)).padStart(2, "0") + ":" + String((i * 7) % 60).padStart(2, "0"),
      modelId: model.modelId,
      effort: i % 3 === 0 ? "High" : "Medium",
      fast: i % 4 === 0,
      kind: "LLM",
      route: "TOOLS",
      finish: failed ? "-" : "stop",
      http: failed ? 429 : 200,
      duration: 840 + i * 90,
      ttfb: 120 + i * 6,
      ttfr: 210 + i * 8,
      ttft: 260 + i * 11,
      input, output, total: input + output, cacheRead: cache, cacheWrite: 40 + i * 3,
      reasoning: i % 2 ? 60 + i : 0,
      messages: 2 + (i % 6),
      tools: i % 3,
      detailed: i % 2 === 0,
      errorKind: failed ? "rate_limit" : "-",
      errorMessage: failed ? "请求过于频繁" : "-",
      hash: model.hash,
    };
  });

  const presets = [
    { name: "智谱 GLM", models: "glm-5.3 / glm-4.7" },
    { name: "Kimi (Moonshot)", models: "kimi-k2" },
    { name: "DeepSeek", models: "deepseek-v4-pro" },
    { name: "火山引擎方舟", models: "ark-code-latest" },
    { name: "MiniMax", models: "MiniMax-M2" },
  ];

  const plugins = [
    { id: "codex", name: "Codex", vendor: "OpenAI", accounts: 1, models: 6, ready: true, login: "使用 ChatGPT 登录" },
    { id: "grok", name: "Grok", vendor: "xAI", accounts: 0, models: 0, ready: false, login: "使用 xAI 登录" },
    { id: "google", name: "Google", vendor: "Google", accounts: 1, models: 4, ready: true, login: "使用 Google (Antigravity) 登录" },
  ];

  function series(seed) {
    return Array.from({ length: 36 }, (_, i) => {
      const wave = 0.55 + 0.45 * Math.abs(Math.sin((i + seed) / 3.2));
      const input = Math.round(18000 * wave);
      return {
        t: "00:" + String(i).padStart(2, "0"),
        input: Math.round(input * 0.34),
        cache: Math.round(input * 0.48),
        write: Math.round(input * 0.08),
        output: Math.round(input * 0.1),
      };
    });
  }

  function heat() {
    const cells = [];
    for (let i = 0; i < 53 * 7; i++) {
      const n = Math.abs(Math.sin(i * 0.37) * Math.cos(i * 0.11));
      cells.push(n < 0.15 ? 0 : n < 0.35 ? 1 : n < 0.55 ? 2 : n < 0.75 ? 3 : 4);
    }
    return cells;
  }

  return { models, calls, presets, plugins, series: series(2), heat: heat(),
    metrics: { hit: 99, calls: 324, ok: 322, fail: 2, tokens: "6.1M", prompt: "5.3M", value: "$24.57", cache: "$5.27" } };
})();
