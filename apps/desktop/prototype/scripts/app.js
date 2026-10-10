(function () {
  const $ = (sel, root = document) => root.querySelector(sel);
  const pages = [
    { id: "overview", label: "概览", key: "⌘1", icon: "chart-2" },
    { id: "calls", label: "调用", key: "⌘2", icon: "history-2" },
    { id: "cursor", label: "Cursor", key: "⌘3", icon: "cpu-bolt" },
    { id: "plugins", label: "插件", key: "⌘4", icon: "widget-5" },
  ];
  const S = {
    theme: "dark", platform: "macos", size: "1040", view: "app",
    page: "overview", collapsed: false, scenario: "normal",
    takeover: true, ca: "ready", plugins: "ready",
    range: "近1小时", group: "flat", query: "", status: "all",
    cols: { status: true, name: true, time: true, model: true, http: true, dur: true, ttft: true, tokens: true },
    settings: "general", setQuery: "",
    panel: null, dirty: false, drawer: null, tab: "info",
    command: false, confirm: null, pop: null, oauth: false,
    ad: true, quickHide: false, tests: {}, tick: "刚刚",
    editor: blankEditor(), progress: 35, pluginPhase: 0,
  };

  function blankEditor() {
    return { name: "", modelId: "gpt-5", type: "OpenAI", protocol: "Responses", host: "https://api.openai.com", key: "", display: "", note: "", preset: "" };
  }
  function ico(name, bold) {
    const item = window.ICON_SET[name];
    if (!item) return "";
    const body = bold ? item.bold : item.line;
    return `<svg class="ico" viewBox="0 0 ${item.w} ${item.h}" aria-hidden="true">${body}</svg>`;
  }
  function esc(v) {
    return String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  }
  function toast(text) {
    const el = document.createElement("div");
    el.className = "toast";
    el.textContent = text;
    $("#toasts").appendChild(el);
    setTimeout(() => el.remove(), 2200);
  }
  function chip(text, kind) { return `<span class="chip ${kind || ""}">${esc(text)}</span>`; }

  function applyScenario(name) {
    S.scenario = name;
    S.panel = null; S.drawer = null; S.dirty = false;
    if (name === "first") {
      S.ca = "missing"; S.takeover = false; S.plugins = "need"; S.quickHide = false; S.ad = true;
    } else if (name === "error") {
      S.ca = "ready"; S.takeover = false; S.plugins = "fail"; S.quickHide = true;
    } else {
      S.ca = "ready"; S.takeover = true; S.plugins = "ready"; S.quickHide = false;
    }
  }

  function models() {
    if (S.scenario === "first") return [];
    return DATA.models.map((m) => {
      const t = S.tests[m.hash];
      let test = S.scenario === "error" && m.test === "ok" && m.hash.endsWith("3") ? "fail" : m.test;
      if (t) test = t;
      return { ...m, test };
    });
  }

  function brand(m) {
    if (m.brand && m.brand.icon) return `<span class="brand"><img alt="" src="${m.brand.icon}"></span>`;
    const tint = (m.brand && m.brand.tint) || "var(--accent)";
    const letter = (m.brand && m.brand.letter) || m.vendor.slice(0, 1);
    return `<span class="brand"><span style="color:${tint}">${esc(letter)}</span></span>`;
  }
  function protoChip(m) {
    if (m.type === "Anthropic") return chip("Anthropic", "anth");
    if (m.protocol === "Responses") return chip("Responses", "resp");
    return chip("Chat", "chat");
  }
  function testCell(m) {
    if (m.test === "run") return `<span class="faint">${ico("refresh")} 测试中…</span>`;
    if (m.test === "ok") return `<span class="muted">速度 ${m.speed.toFixed(1)} tok/s · 首字 ${m.ttft} ms</span>`;
    if (m.test === "fail") return `<span style="color:var(--bad)">错误：${esc(m.error)}</span>`;
    return `<span class="faint">未测试</span>`;
  }

  function nav() {
    const root = $("#nav");
    root.innerHTML = `<div class="nav-indicator" id="ind"></div>` + pages.map((p) => `
      <button class="nav-item ${S.page === p.id ? "on" : ""}" data-page="${p.id}" data-tip="${esc(p.label)} ${p.key}">
        ${ico(p.icon, S.page === p.id)}<span>${esc(p.label)}</span><span class="k">${p.key}</span>
      </button>`).join("");
    const idx = pages.findIndex((p) => p.id === S.page);
    const ind = $("#ind");
    ind.style.opacity = idx < 0 ? "0" : "1";
    ind.style.transform = `translateY(${Math.max(0, idx) * 36}px)`;
    const set = $("#settings-btn");
    set.classList.toggle("on", S.page === "settings");
    set.innerHTML = `${ico("settings", S.page === "settings")}<span>设置</span><i class="badge" title="有可用更新"></i>`;
  }

  function capsule() {
    const el = $("#capsule");
    let kind = "ok", text = "已接管", sub = "运行中";
    if (S.ca === "missing") { kind = "bad"; text = "未初始化"; sub = "CA"; }
    else if (S.ca === "untrusted") { kind = "warn"; text = "未信任"; sub = "CA"; }
    else if (!S.takeover) { kind = "warn"; text = "未接管"; sub = "已停止"; }
    else if (S.plugins === "fail") { kind = "bad"; text = "已接管"; sub = "插件异常"; }
    el.innerHTML = `<i class="dot ${kind} ${S.takeover && S.ca === "ready" ? "pulse" : ""}"></i><span>${text}</span><span class="sub">${sub}</span>`;
    el.dataset.tip = "本地服务状态 · 需确认";
  }

  function head() {
    const map = { overview: "概览", calls: "调用", cursor: "Cursor", plugins: "插件", settings: "设置" };
    $("#title").textContent = map[S.page];
    $("#actions").innerHTML = actions();
  }
  function actions() {
    if (S.page === "overview") return `
      <div class="seg" id="ranges">${["近10分钟","近1小时","近1自然日","近一周","近一个月"].map((r) => `<button class="${S.range === r ? "on" : ""}" data-range="${r}">${r}</button>`).join("")}
        <button data-pop="range" class="${S.range === "自定义" ? "on" : ""}">自定义</button></div>
      <button class="icon-btn" data-act="refresh" data-tip="刷新">${ico("refresh")}</button>`;
    if (S.page === "calls") return `
      <span class="chip ok">${ico("pulse-2")} 实时 · ${S.tick}</span>
      <span class="proposal">需确认</span>
      <div class="search" style="width:180px">${ico("minimalistic-magnifer")}<input id="q" placeholder="搜索模型 / ID" value="${esc(S.query)}"></div>
      <div class="seg" id="st">${[["all","全部"],["completed","成功"],["failed","异常"]].map(([id,l]) => `<button data-st="${id}" class="${S.status===id?"on":""}">${l}</button>`).join("")}</div>
      <button class="btn quiet" data-pop="cols">${ico("tuning-2")} 列设置</button>`;
    if (S.page === "cursor") return `
      <span class="chip ${S.takeover ? "ok" : "warn"}">${S.takeover ? "已接管" : "未接管"}</span>
      <button class="switch ${S.takeover ? "on" : ""}" data-act="takeover" data-tip="开启接管Cursor / 关闭接管Cursor"><i></i></button>
      <div class="seg" id="group">${[["flat","默认平铺"],["vendor","按供应商"],["type","按类型"]].map(([id,l]) => `<button data-group="${id}" class="${S.group===id?"on":""}">${l}</button>`).join("")}</div>
      <button class="btn" data-act="testall">${ico("test-tube")} 一键测试</button>
      <button class="icon-btn" data-act="add" data-tip="添加模型">${ico("add-circle")}</button>`;
    if (S.page === "plugins") return `<button class="btn quiet" data-act="reinit">${ico("restart")} 重新初始化插件</button>`;
    return `<div class="search" style="width:200px">${ico("minimalistic-magnifer")}<input id="setq" placeholder="搜索设置" value="${esc(S.setQuery)}"></div><span class="proposal">需确认</span>`;
  }

  function overview() {
    const steps = [
      ["初始化 CA", S.ca === "ready"],
      ["开启接管", S.takeover],
      ["添加模型", models().length > 0],
      ["测试连通", models().some((m) => m.test === "ok")],
      ["重启 Cursor", S.quickHide],
    ];
    const done = steps.every((s) => s[1]);
    const quick = done && S.quickHide ? "" : `<div class="quick">${steps.map((s, i) => `
      <button class="step ${s[1] ? "done" : "on"}" data-act="quick" data-i="${i}">
        <span class="proposal">需确认</span>
        <b>${i + 1}. ${s[0]}</b><span>${s[1] ? "已完成" : "去完成"}</span>
      </button>`).join("")}</div>`;
    const m = DATA.metrics;
    return `${quick}
      <div class="card" style="padding:12px 12px 4px">
        <div class="row-between"><strong>日 Token 用量</strong>
          <div class="legend"><span><b style="background:var(--chart-in)"></b>输入（非缓存）</span><span><b style="background:var(--chart-cache)"></b>缓存输入</span><span><b style="background:var(--chart-write)"></b>缓存写入</span><span><b style="background:var(--chart-out)"></b>模型输出</span></div>
        </div>
        <div class="chart" data-chart="bar"></div>
      </div>
      <div class="metrics">
        <div class="card metric"><div class="k">缓存命中率 ${ico("info-circle")}</div><div class="gauge" data-chart="gauge" data-value="${m.hit}"></div></div>
        <div class="card metric"><div class="k">LLM 调用</div><div class="v num">${m.calls}</div><div class="s">成功 ${m.ok} / 异常 ${m.fail}</div></div>
        <div class="card metric"><div class="k">Token 消耗</div><div class="v num">${m.tokens}</div><div class="s">提示词 ${m.prompt}</div></div>
        <div class="card metric"><div class="k">价格估算</div><div class="v num">${m.value}</div><div class="s">缓存读写 ${m.cache}</div></div>
      </div>
      <div class="card"><div style="padding:12px 12px 0" class="muted">过去一年的 Token 用量</div>
        <div class="heat">${DATA.heat.map((n) => `<i class="l${n}"></i>`).join("")}</div>
      </div>`;
  }

  function calls() {
    const cols = [
      ["status", "状态"], ["name", "显示名称"], ["time", "时间"], ["model", "模型名称"],
      ["http", "HTTP"], ["dur", "耗时"], ["ttft", "TTFT"], ["tokens", "Total Token"],
    ];
    const rows = DATA.calls.filter((c) => (S.status === "all" || c.status === S.status) && (`${c.name} ${c.modelId} ${c.id}`.toLowerCase().includes(S.query.toLowerCase())));
    const head = cols.filter((c) => S.cols[c[0]]).map((c) => `<th>${c[1]}</th>`).join("") + "<th>操作</th>";
    const body = rows.map((c) => `<tr data-call="${c.id}" class="${c.status === "failed" ? "fail" : ""}">` + cols.filter((col) => S.cols[col[0]]).map((col) => {
      if (col[0] === "status") return `<td class="status ${c.status}">${c.status}</td>`;
      if (col[0] === "name") return `<td>${esc(c.name)}</td>`;
      if (col[0] === "time") return `<td class="mono">${c.time}</td>`;
      if (col[0] === "model") return `<td class="mono">${esc(c.modelId)}</td>`;
      if (col[0] === "http") return `<td class="num">${c.http}</td>`;
      if (col[0] === "dur") return `<td class="num">${c.duration} ms</td>`;
      if (col[0] === "ttft") return `<td class="num">${c.ttft} ms</td>`;
      return `<td class="num">${c.total}</td>`;
    }).join("") + `<td><button class="icon-btn" data-tip="查看详情">${ico("square-top-down")}</button></td></tr>`).join("");
    return `<div class="card table-wrap"><table class="data"><thead><tr>${head}</tr></thead><tbody>${body || `<tr><td colspan="9" class="faint">暂无数据</td></tr>`}</tbody></table></div>`;
  }

  function cursor() {
    if (S.ca === "missing") return gate("shield-warning", "需要先初始化本地 CA", "CA 仅保存在本机，初始化后才能开启接管。", `<button class="btn primary" data-act="initca">初始化 CA</button>`);
    if (S.ca === "untrusted") return gate("lock-keyhole-minimalistic", "需要在系统中信任本地 CA", "安装命令已自动复制。打开终端后粘贴即可。", `<button class="btn primary" data-act="term">打开终端安装 CA</button> <button class="btn" data-act="trusted">我已初始化，刷新</button>`);
    const list = models();
    if (!list.length) return gate("box-minimalistic", "还没有可供 Cursor 使用的模型", "Cursor 接管已生效；添加模型配置后即可使用 TOOLS 模型。", `<button class="btn primary" data-act="add">添加模型</button> <button class="btn" data-act="import">导入旧版配置</button>`);
    const groups = {};
    list.forEach((m) => {
      const key = S.group === "vendor" ? m.vendor : S.group === "type" ? (m.type === "Anthropic" ? "Anthropic" : "OpenAI " + m.protocol) : "全部";
      (groups[key] = groups[key] || []).push(m);
    });
    return Object.entries(groups).map(([name, rows]) => `
      ${S.group === "flat" ? "" : `<div class="group-h">${esc(name)} · ${rows.length}</div>`}
      <div class="card">${rows.map((m) => `
        <div class="model">
          <button class="handle" data-tip="拖动排序">${ico("hamburger-menu")}</button>
          ${brand(m)}
          <div><div class="name">${esc(m.name)} ${protoChip(m)}</div><div class="id mono">${esc(m.modelId)} · ${esc(m.host)}</div><div>${testCell(m)}</div></div>
          <div class="muted" style="font-size:12px">${m.test === "ok" ? "可调用" : ""}</div>
          <div style="display:flex;gap:6px">
            <button class="btn quiet" data-test="${m.hash}">${m.test === "run" ? "取消测试" : "测试"}</button>
            <button class="btn quiet" data-edit="${m.hash}">编辑</button>
            <button class="icon-btn" data-menu="${m.hash}" data-tip="复制 / 删除">${ico("menu-dots")}</button>
          </div>
        </div>`).join("")}</div>`).join("");
  }
  function gate(icon, title, text, buttons) {
    return `<div class="card gate">${ico(icon)}<h2>${title}</h2><p>${text}</p><div style="display:flex;gap:8px;justify-content:center">${buttons}</div></div>`;
  }

  function plugins() {
    if (S.plugins === "need") return gate("widget-5", "需要先初始化插件运行时", "内置登录插件在独立运行时里执行。", `<button class="btn primary" data-act="initplug">初始化插件</button>`);
    if (S.plugins === "progress") return `<div class="card" style="padding:18px"><strong>初始化插件运行时</strong><p class="muted">下载运行时 · ${S.progress}%</p><div class="progress"><i style="width:${S.progress}%"></i></div></div>`;
    if (S.plugins === "fail") return gate("danger-triangle", "初始化失败", "无法下载插件运行时，请检查网络后重试。", `<button class="btn primary" data-act="initplug">重新初始化插件</button>`);
    if (S.plugins === "unsupported") return gate("forbidden-circle", "当前系统不支持插件运行时", "此平台没有对应的运行时包。", "");
    return DATA.plugins.map((p) => `
      <div class="card plugin">
        ${brand({ vendor: p.vendor, brand: DATA.models.find((m) => m.vendor === p.vendor)?.brand || { letter: p.name[0], tint: "var(--accent)" } })}
        <div><div class="name">${esc(p.name)} ${p.ready ? chip("已配置", "ok") : chip("未配置", "warn")}</div>
          <div class="faint">${p.accounts} 个账号 · ${p.models} 个模型</div></div>
        <div style="display:flex;gap:6px">
          <button class="btn" data-oauth="${p.id}">${ico("login-3")} 添加账号</button>
          <button class="btn quiet" data-acc="${p.id}">账号管理</button>
        </div>
      </div>`).join("");
  }

  const settingsNav = [
    ["general", "通用"], ["observe", "调用观测"], ["net", "网络"], ["tab", "TAB"],
    ["commit", "Commit"], ["app", "应用"], ["data", "数据"], ["about", "关于"],
  ];
  function settings() {
    const q = S.setQuery.trim();
    const blocks = {
      general: section("通用", [
        row("界面语言", "跟随系统、简体中文或 English。", `<select><option>跟随系统</option><option>简体中文</option><option>English</option></select>`),
        row("主题", "默认暗色 / 默认亮色，立即生效。", `<div class="seg"><button class="${S.theme==="dark"?"on":""}" data-theme="dark">默认暗色</button><button class="${S.theme==="light"?"on":""}" data-theme="light">默认亮色</button></div>`),
      ]),
      observe: section("调用观测", [row("详细模式", "记录请求与响应流。关闭后详情页没有报文。", `<button class="switch on" data-act="noop"><i></i></button>`)]),
      net: section("网络", [
        row("代理端口", "占用时自动换端口。", `<input class="mono" value="54321" style="width:120px">`),
        row("服务端口", "本机管理服务。", `<input class="mono" value="3000" style="width:120px">`),
        row("代理方式", "默认直连，或自定义上游代理。", `<select><option>默认</option><option>自定义</option></select>`),
      ]),
      tab: section("TAB 设置", [row("TAB 选择", "公益服务、官方直连或自建 tab-server。", `<select><option>使用公益服务</option><option>直连</option><option>自定义</option></select>`)]),
      commit: section("Commit 提交代码模型设置", [row("生成模型", "用于生成提交说明，可选直连。", `<select><option>直连</option><option>Claude Sonnet 4</option></select>`), row("提示词设置", "可恢复默认。", `<button class="btn quiet" data-act="prompt">提示词设置</button>`)]),
      app: section("应用设置", [
        row("开机启动", "登录后自动打开。", `<button class="switch on" data-act="noop"><i></i></button>`),
        row("静默启动", "开机启动时不显示主窗口。", `<button class="switch" data-act="noop"><i></i></button>`),
        row("在 Dock 栏显示", "仅 macOS。", `<button class="switch on" data-act="noop"><i></i></button>`),
        row("软件更新", "有可用更新时侧栏设置项显示红点。", `<button class="btn primary" data-act="update">检查更新</button>`),
      ]),
      data: section("数据", [
        row("旧版配置", "导入并跳过已存在的模型。", `<button class="btn" data-act="import">查看并导入</button>`),
        row("存储管理", "统计数据约 26 MB。", `<button class="btn danger" data-act="purge">清理存储空间</button>`),
      ]),
      about: `<div class="card" style="padding:4px 16px 12px"><h2 style="font-size:14px">关于</h2>
        <div class="set-row"><div><strong>Cursor TOOLS</strong><p>${S.scenario === "error" ? "版本 1.0.2 可以安装" : "当前版本 1.0.1"}</p></div>
          <button class="btn ${S.scenario === "error" ? "primary" : ""}" data-act="update">${S.scenario === "error" ? "下载并安装" : "检查更新"}</button></div>
        <div class="set-row"><div><strong>链接</strong><p>官网、更新日志和项目仓库。</p></div>
          <div style="display:flex;gap:8px;flex-wrap:wrap"><button class="btn quiet" data-act="site">官网</button><button class="btn quiet" data-act="log">更新日志</button><button class="btn quiet" data-act="star">在 GitHub 上标星</button></div></div>
        <div class="set-row"><div><strong>近期更新</strong><p>查看每个版本的更新说明。</p></div><button class="btn quiet" data-act="recent">查看近期更新</button></div>
      </div>`,
    };
    const nav = settingsNav.filter((n) => !q || n[1].includes(q) || (blocks[n[0]] || "").includes(q));
    return `<div class="set-layout"><div class="set-nav card" style="padding:6px">${nav.map(([id, label]) => `<button class="${S.settings===id?"on":""}" data-set="${id}">${label}</button>`).join("")}</div><div>${blocks[S.settings] || ""}</div></div>`;
  }
  function section(title, rows) { return `<div class="card" style="padding:4px 16px 8px"><h2 style="font-size:14px">${title}</h2>${rows.join("")}</div>`; }
  function row(title, desc, control) { return `<div class="set-row"><div><strong>${title}</strong><p>${desc}</p></div><div>${control}</div></div>`; }

  function spec() {
    const colors = [["--bg","底"],["--bg-side","侧栏"],["--bg-card","卡片"],["--accent","信号青"],["--ok","成功"],["--warn","警告"],["--bad","错误"],["--chart-in","输入"],["--chart-cache","缓存"],["--chart-write","写入"],["--chart-out","输出"]];
    const icons = ["chart-2","history-2","cpu-bolt","widget-5","settings","shield-check","test-tube","bolt"];
    return `<div class="spec">
      <div><strong>色板</strong><div class="swatches">${colors.map(([k,n]) => `<div class="sw"><i style="background:var(${k})"></i><b>${n}</b></div>`).join("")}</div></div>
      <div><strong>字号</strong><div class="stack" style="margin-top:8px"><div style="font-size:12px">12 次要信息</div><div style="font-size:13px">13 辅助</div><div style="font-size:14px">14 正文 / 标题</div><div style="font-size:16px">16</div><div class="num" style="font-size:30px">30 指标 6.1M</div></div></div>
      <div><strong>图标 · 线性双色 / 实心双色</strong><div class="icon-board">${icons.map((n) => `<div class="cell"><div class="pair">${ico(n, false)}${ico(n, true)}</div>${n}</div>`).join("")}</div></div>
      <div><strong>控件</strong><div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:8px"><button class="btn primary">主按钮</button><button class="btn">次按钮</button><button class="btn quiet">安静</button><button class="btn danger">危险</button><button class="switch on"><i></i></button><button class="switch"><i></i></button>${chip("已接管","ok")}${chip("未测试","warn")}${chip("失败","bad")}</div></div>
    </div>`;
  }

  function renderPage() {
    const el = $("#scroll");
    const html = S.view === "spec" ? spec() : ({ overview, calls, cursor, plugins, settings }[S.page] || overview)();
    el.innerHTML = html;
    el.classList.remove("enter");
    void el.offsetWidth;
    el.classList.add("enter");
    requestAnimationFrame(() => window.Charts.mount());
  }

  function render() {
    document.documentElement.dataset.theme = S.theme;
    const win = $("#window");
    win.dataset.platform = S.platform;
    win.dataset.size = S.size;
    win.classList.toggle("collapsed", S.collapsed);
    $("#ad").hidden = !S.ad;
    nav(); capsule(); head();
    renderPage();
    renderOverlay();
  }

  function renderOverlay() {
    const host = $("#overlay");
    host.innerHTML = "";
    if (S.command) host.appendChild(palette());
    if (S.confirm) host.appendChild(dialog());
    if (S.oauth) host.appendChild(oauth());
    if (S.pop) host.appendChild(popover());
    if (S.panel) host.appendChild(sheet());
    if (S.drawer) host.appendChild(drawer());
  }

  function palette() {
    const wrap = document.createElement("div");
    wrap.className = "overlay";
    const items = [
      ["概览", "chart-2", "go:overview"], ["调用", "history-2", "go:calls"], ["Cursor", "cpu-bolt", "go:cursor"],
      ["插件", "widget-5", "go:plugins"], ["设置", "settings", "go:settings"],
      ["添加模型", "add-circle", "add"], ["一键测试", "test-tube", "testall"], ["开关接管", "bolt", "takeover"],
      ["切换主题", "moon", "theme"], ["检查更新", "refresh", "update"],
    ].concat(models().slice(0, 6).map((m) => [m.name, "server-square", "edit:" + m.hash]));
    const q = (S.cmd || "").toLowerCase();
    wrap.innerHTML = `<div class="palette"><input id="cmd" placeholder="跳转、操作或搜索模型…" value="${esc(S.cmd || "")}">${
      items.filter((i) => i[0].toLowerCase().includes(q)).map((i, n) => `<button class="cmd ${n===0?"on":""}" data-cmd="${i[2]}">${ico(i[1])}<span>${esc(i[0])}</span></button>`).join("")
    }</div>`;
    return wrap;
  }
  function dialog() {
    const wrap = document.createElement("div");
    wrap.className = "overlay";
    const map = {
      dirty: ["放弃未保存的修改？", "模型编辑尚未保存。", "继续编辑", "放弃"],
      takeover: ["关闭接管 Cursor？", "关闭后会清除 Cursor 的本地代理设置。如果要登录官方账号，一般不用关闭。", "取消", "关闭接管"],
      del: ["确定删除这个模型吗？", "删除后需要重新添加才能在 Cursor 里使用。", "取消", "删除"],
      purge: ["清理存储空间", "可仅清理详细记录，或清理全部统计。此操作不可撤销。", "取消", "清理"],
      tutorial: ["打开使用教程？", "将在系统浏览器中打开使用帮助。", "取消", "打开教程"],
    };
    const [h, p, a, b] = map[S.confirm] || map.dirty;
    wrap.innerHTML = `<div class="dialog"><h3>${h}</h3><p>${p}</p><div class="row"><button class="btn" data-confirm="no">${a}</button><button class="btn primary" data-confirm="yes">${b}</button></div></div>`;
    return wrap;
  }
  function oauth() {
    const wrap = document.createElement("div");
    wrap.className = "overlay";
    wrap.innerHTML = `<div class="dialog"><h3>添加账号</h3><p>在浏览器确认后返回这里。设备验证码：</p><div class="oauth-code">K7QM-2F</div><div class="row" style="margin-top:12px"><button class="btn" data-act="copycode">${ico("copy")} 复制</button><button class="btn primary" data-act="openauth">打开授权网页</button><button class="btn quiet" data-close="1">关闭</button></div><p class="faint">等待网页端确认授权中…</p></div>`;
    return wrap;
  }
  function popover() {
    const wrap = document.createElement("div");
    wrap.className = "overlay";
    wrap.style.background = "transparent";
    let inner = "";
    if (S.pop === "cols") inner = `<div class="cols">${Object.entries({status:"状态",name:"显示名称",time:"时间",model:"模型名称",http:"HTTP",dur:"耗时",ttft:"TTFT",tokens:"Total Token"}).map(([k,l]) => `<label><input type="checkbox" data-col="${k}" ${S.cols[k]?"checked":""}> ${l}</label>`).join("")}</div>`;
    if (S.pop === "range") inner = `<div class="stack"><label class="field">开始时间<input placeholder="如：1小时前"></label><label class="field">结束时间<input placeholder="如：现在"></label><button class="btn primary" data-act="applyrange">应用</button></div>`;
    if (S.pop === "status") inner = `<div class="stack"><div>CA：${S.ca === "ready" ? "已信任" : "未就绪"}</div><div class="mono">127.0.0.1:54321</div><button class="btn" data-act="copyproxy">复制代理地址</button><button class="btn" data-act="takeover">${S.takeover ? "关闭接管" : "开启接管"}</button><span class="proposal">需确认</span></div>`;
    if (S.pop === "menu") inner = `<div class="stack"><button class="btn quiet" data-act="dup">复制</button><button class="btn danger" data-act="del">删除</button></div>`;
    wrap.innerHTML = `<div class="pop" style="top:120px;right:24px">${inner}</div>`;
    return wrap;
  }
  function sheet() {
    const wrap = document.createElement("div");
    wrap.className = "sheet";
    if (S.panel === "accounts") {
      wrap.innerHTML = `<div class="sheet-head"><button class="icon-btn" data-close="1">${ico("arrow-left")}</button><strong>账号管理</strong></div><div class="sheet-body" style="grid-template-columns:1fr"><div class="card"><div class="acct"><div><b>chatgpt-main</b><div class="faint">6 个模型 · 可调用</div></div><button class="btn quiet">同步模型</button></div><div class="acct"><div><b>备用账号</b><div class="faint">尚未同步模型 · 未就绪</div></div><span class="chip warn">冷却中</span></div></div></div>`;
      return wrap;
    }
    if (S.panel === "import") {
      wrap.innerHTML = `<div class="sheet-head"><button class="icon-btn" data-close="1">${ico("arrow-left")}</button><strong>确认导入旧版模型配置</strong></div><div class="sheet-body" style="grid-template-columns:1fr"><div class="card" style="padding:12px">将新增 3 · 已存在 1，已存在的会跳过。<div style="margin-top:8px">DeepSeek V3 · ${chip("新增","ok")}　GLM-4.5 · ${chip("已存在，跳过")}</div></div></div><div class="sheet-foot"><button class="btn" data-close="1">取消</button><button class="btn primary" data-act="doimport">确认导入</button></div>`;
      return wrap;
    }
    const e = S.editor;
    wrap.innerHTML = `<div class="sheet-head"><button class="icon-btn" data-close="1">${ico("arrow-left")}</button><strong>${e.display || e.name ? "编辑模型" : "添加模型"}</strong><span class="proposal">需确认</span>${S.dirty ? chip("未保存", "warn") : ""}</div>
      <div class="sheet-body"><div class="editor">
        <div class="card" style="padding:12px"><div class="faint">常用预设</div><div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:8px">${DATA.presets.map((p) => `<button class="btn ${e.preset===p.name?"primary":"quiet"}" data-preset="${esc(p.name)}">${esc(p.name)}</button>`).join("")}</div></div>
        <div class="grid-2">
          <label class="field">模型类型<select data-ed="type"><option ${e.type==="OpenAI"?"selected":""}>OpenAI</option><option ${e.type==="Anthropic"?"selected":""}>Anthropic</option></select></label>
          <label class="field">请求协议<select data-ed="protocol"><option>Responses</option><option>Chat</option><option>Messages</option></select></label>
          <label class="field">服务器地址<input data-ed="host" value="${esc(e.host)}"></label>
          <label class="field">API Key<input data-ed="key" placeholder="sk-xxxxxx" value="${esc(e.key)}"></label>
          <label class="field">模型名称<input data-ed="modelId" value="${esc(e.modelId)}"></label>
          <label class="field">显示名称<input data-ed="display" placeholder="例如：主力模型" value="${esc(e.display)}"></label>
        </div>
        <label class="field">备注<textarea data-ed="note">${esc(e.note)}</textarea></label>
        <details class="card" style="padding:10px 12px"><summary>高级 · 自定义 Headers / 额外参数</summary><label class="field" style="margin-top:8px">自定义 Headers<textarea>{}</textarea></label></details>
      </div>
      <aside class="card preview"><div class="faint">在 Cursor 里显示的样子</div><div class="fake"><b>${esc(e.display || e.name || "未命名模型")}</b><div class="mono faint">${esc(e.modelId || "model-id")}</div>${e.type === "Anthropic" ? chip("Anthropic","anth") : chip(e.protocol === "Chat" ? "Chat" : "Responses", e.protocol === "Chat" ? "chat" : "resp")}</div>
        <div class="testline" id="inline-test">尚未测试。保存并测试后显示首字与速度。</div>
        <button class="btn" data-act="inlinetest" style="margin-top:8px">测试</button>
      </aside></div>
      <div class="sheet-foot"><button class="btn" data-close="1">取消</button><button class="btn" data-act="save-test">保存并测试</button><button class="btn primary" data-act="save">保存</button></div>`;
    return wrap;
  }
  function drawer() {
    const c = DATA.calls.find((x) => x.id === S.drawer) || DATA.calls[0];
    const wrap = document.createElement("div");
    wrap.className = "drawer";
    const tabs = [["info","调用信息"],["req","请求"],["res","响应流"],["trace","Cursor 追踪"]];
    wrap.innerHTML = `<div class="sheet-head"><strong class="mono">${esc(c.id)}</strong><span class="status ${c.status}">${c.status}</span><span class="proposal">需确认</span><button class="btn quiet" data-act="newwin" style="margin-left:auto">在新窗口打开</button><button class="icon-btn" data-close="1">${ico("close-circle")}</button></div>
      <div style="padding:8px 16px" class="seg">${tabs.map(([id,l]) => `<button data-tab="${id}" class="${S.tab===id?"on":""}">${l}</button>`).join("")}</div>
      <div class="body">${S.tab==="info" ? `<div class="kv"><span>显示名称</span><b>${esc(c.name)}</b><span>模型名称</span><b class="mono">${esc(c.modelId)}</b><span>路由</span><b>${c.route}</b><span>HTTP</span><b>${c.http}</b><span>耗时</span><b>${c.duration} ms</b><span>TTFT</span><b>${c.ttft} ms</b><span>Total Token</span><b>${c.total}</b><span>Error</span><b>${esc(c.errorMessage)}</b></div>` : S.tab==="req" ? (c.detailed ? `<pre class="raw">{ "model": "${esc(c.modelId)}", "stream": true }</pre>` : `<p class="faint">未记录请求内容，请开启详细记录后重试。</p>`) : S.tab==="res" ? (c.detailed ? `<pre class="raw">data: {"choices":[{"delta":{"content":"…"}}]}</pre>` : `<p class="faint">未记录响应内容，请开启详细记录后重试。</p>`) : `<p class="muted">Cursor 追踪工件将在详细记录开启后显示。</p>`}</div>`;
    return wrap;
  }

  function go(page) {
    if (S.dirty) { S.confirm = "dirty"; S.pendingPage = page; renderOverlay(); return; }
    S.page = page; S.view = "app"; S.panel = null; S.drawer = null; S.pop = null;
    render();
  }
  function run(act, extra) {
    if (act === "refresh") { toast("已刷新"); return; }
    if (act === "takeover") {
      if (S.takeover) { S.confirm = "takeover"; renderOverlay(); return; }
      if (S.ca !== "ready") { toast("请先初始化 CA"); return; }
      S.takeover = true; toast("已开启接管"); render(); return;
    }
    if (act === "add") { S.editor = blankEditor(); S.panel = "editor"; S.dirty = false; render(); return; }
    if (act === "import") { S.panel = "import"; render(); return; }
    if (act === "initca") { S.ca = "untrusted"; toast("安装命令已复制"); render(); return; }
    if (act === "trusted" || act === "term") { S.ca = "ready"; toast(act === "term" ? "已打开终端" : "CA 已信任"); render(); return; }
    if (act === "initplug" || act === "reinit") { S.plugins = "progress"; S.progress = 20; render(); const t = setInterval(() => { S.progress += 25; if (S.progress >= 100) { clearInterval(t); S.plugins = "ready"; toast("插件运行时已安装"); } render(); }, 400); return; }
    if (act === "testall") { toast("开始一键测试"); models().forEach((m, i) => setTimeout(() => testModel(m.hash), i * 180)); return; }
    if (act === "theme") { S.theme = S.theme === "dark" ? "light" : "dark"; render(); return; }
    if (act === "update") { toast(S.scenario === "error" ? "开始下载 1.0.2" : "当前已是最新版本"); return; }
    if (act === "site") { toast("打开官网"); return; }
    if (act === "log" || act === "recent") { toast("打开更新日志"); return; }
    if (act === "star") { toast("打开 GitHub"); return; }
    if (act === "copycode" || act === "copyproxy") { toast("已复制"); return; }
    if (act === "openauth") { toast("已打开授权网页"); return; }
    if (act === "newwin") { toast("将在新窗口打开详情"); return; }
    if (act === "prompt") { toast("提示词设置"); return; }
    if (act === "purge") { S.confirm = "purge"; renderOverlay(); return; }
    if (act === "del") { S.confirm = "del"; S.pop = null; renderOverlay(); return; }
    if (act === "dup") { toast("已复制模型"); S.pop = null; render(); return; }
    if (act === "doimport") { toast("已导入，已存在的已跳过"); S.panel = null; render(); return; }
    if (act === "save" || act === "save-test") { toast(act === "save" ? "已保存" : "已保存并开始测试"); S.dirty = false; S.panel = null; render(); return; }
    if (act === "inlinetest") { const n = $("#inline-test"); if (n) n.textContent = "速度 38.6 tokens/s · 首字 418 ms · 总耗时 1284 ms"; return; }
    if (act === "applyrange") { S.range = "自定义"; S.pop = null; render(); return; }
    if (act === "quick") {
      const i = Number(extra);
      if (i === 0) run("initca");
      else if (i === 1) run("takeover");
      else if (i === 2) go("cursor");
      else if (i === 3) { go("cursor"); run("testall"); }
      else { S.quickHide = true; toast("请完全退出并重新打开 Cursor，再新开对话"); render(); }
      return;
    }
    if (act === "hidead") { S.ad = false; toast("不再显示此广告"); render(); return; }
    if (act === "noop") toast("原型不操作系统窗口");
  }
  function testModel(hash) {
    S.tests[hash] = "run"; render();
    setTimeout(() => { S.tests[hash] = S.scenario === "error" && hash.endsWith("2") ? "fail" : "ok"; if (S.page === "cursor" && !S.panel) render(); }, 700);
  }

  document.addEventListener("click", (ev) => {
    const t = ev.target.closest("[data-page],[data-act],[data-range],[data-st],[data-group],[data-test],[data-edit],[data-menu],[data-pop],[data-set],[data-theme],[data-call],[data-tab],[data-cmd],[data-confirm],[data-close],[data-oauth],[data-acc],[data-preset],[data-col]");
    if ($("#tip")) $("#tip").remove();
    if (!t) {
      if (ev.target.classList.contains("overlay") || ev.target.id === "overlay") { S.command = false; S.pop = null; S.confirm = null; S.oauth = false; renderOverlay(); }
      return;
    }
    if (t.dataset.page) return go(t.dataset.page);
    if (t.id === "settings-btn") return go("settings");
    if (t.dataset.range) { S.range = t.dataset.range; head(); return; }
    if (t.dataset.st) { S.status = t.dataset.st; renderPage(); return; }
    if (t.dataset.group) { S.group = t.dataset.group; renderPage(); return; }
    if (t.dataset.set) { S.settings = t.dataset.set; renderPage(); return; }
    if (t.dataset.theme) { S.theme = t.dataset.theme; render(); return; }
    if (t.dataset.test) return testModel(t.dataset.test);
    if (t.dataset.edit) { const m = models().find((x) => x.hash === t.dataset.edit); S.editor = { ...blankEditor(), display: m.name, modelId: m.modelId, type: m.type, protocol: m.protocol, host: "https://" + m.host, preset: "" }; S.panel = "editor"; S.dirty = false; render(); return; }
    if (t.dataset.menu) { S.pop = "menu"; S.menuHash = t.dataset.menu; renderOverlay(); return; }
    if (t.dataset.pop) { S.pop = t.dataset.pop; renderOverlay(); return; }
    if (t.dataset.call) { S.drawer = t.dataset.call; S.tab = "info"; renderOverlay(); return; }
    if (t.dataset.tab) { S.tab = t.dataset.tab; renderOverlay(); return; }
    if (t.dataset.oauth) { S.oauth = t.dataset.oauth; renderOverlay(); return; }
    if (t.dataset.acc) { S.panel = "accounts"; render(); return; }
    if (t.dataset.preset) { S.editor.preset = t.dataset.preset; S.editor.display = t.dataset.preset; S.dirty = true; render(); return; }
    if (t.dataset.col) { S.cols[t.dataset.col] = t.checked; renderPage(); return; }
    if (t.dataset.cmd) { S.command = false; const [k, v] = t.dataset.cmd.split(":"); if (k === "go") go(v); else if (k === "edit") { S.page = "cursor"; run("add"); } else run(k); return; }
    if (t.dataset.confirm) {
      const yes = t.dataset.confirm === "yes"; const kind = S.confirm; S.confirm = null;
      if (yes && kind === "dirty") { S.dirty = false; S.panel = null; if (S.pendingPage) { S.page = S.pendingPage; S.pendingPage = null; } }
      if (yes && kind === "takeover") { S.takeover = false; toast("已关闭接管"); }
      if (yes && kind === "del") toast("已删除");
      if (yes && kind === "purge") toast("已清理存储空间");
      if (!yes && kind === "dirty") S.pendingPage = null;
      render(); return;
    }
    if (t.dataset.close) {
      if (S.dirty && S.panel === "editor") { S.confirm = "dirty"; renderOverlay(); return; }
      S.panel = null; S.drawer = null; S.oauth = false; S.pop = null; render(); return;
    }
    if (t.dataset.act) run(t.dataset.act, t.dataset.i);
  });

  document.addEventListener("change", (ev) => {
    if (ev.target.dataset.ed) { S.editor[ev.target.dataset.ed] = ev.target.value; S.dirty = true; }
  });
  document.addEventListener("input", (ev) => {
    if (ev.target.id === "q") { S.query = ev.target.value; renderPage(); return; }
    if (ev.target.id === "setq") { S.setQuery = ev.target.value; renderPage(); return; }
    if (ev.target.id === "cmd") { S.cmd = ev.target.value; renderOverlay(); const input = $("#cmd"); if (input) { input.focus(); input.setSelectionRange(input.value.length, input.value.length); } return; }
    if (ev.target.dataset.ed) { S.editor[ev.target.dataset.ed] = ev.target.value; S.dirty = true; const fake = $(".fake"); if (fake) fake.querySelector("b").textContent = S.editor.display || "未命名模型"; }
  });

  document.addEventListener("keydown", (ev) => {
    const meta = ev.metaKey || ev.ctrlKey;
    if (meta && ev.key === "k") { ev.preventDefault(); S.command = !S.command; S.cmd = ""; renderOverlay(); const input = $("#cmd"); if (input) input.focus(); }
    if (meta && ev.key === "\\") { ev.preventDefault(); S.collapsed = !S.collapsed; render(); }
    if (meta && ev.key === ",") { ev.preventDefault(); go("settings"); }
    if (meta && "1234".includes(ev.key)) { ev.preventDefault(); go(pages[Number(ev.key) - 1].id); }
    if (ev.key === "Escape") { S.command = false; S.pop = null; S.oauth = false; if (S.confirm) S.confirm = null; else if (S.dirty && S.panel) S.confirm = "dirty"; else { S.panel = null; S.drawer = null; } render(); }
  });

  document.addEventListener("mouseover", (ev) => {
    const el = ev.target.closest("[data-tip]");
    $("#tip")?.remove();
    if (!el) return;
    const tip = document.createElement("div");
    tip.id = "tip"; tip.className = "tip"; tip.textContent = el.dataset.tip;
    document.body.appendChild(tip);
    const r = el.getBoundingClientRect();
    tip.style.left = Math.min(r.left, window.innerWidth - 180) + "px";
    tip.style.top = (r.bottom + 6) + "px";
  });
  document.addEventListener("mouseout", (ev) => { if (ev.target.closest("[data-tip]")) $("#tip")?.remove(); });

  $("#scroll").addEventListener("scroll", () => { $(".scroll-shadow").classList.toggle("on", $("#scroll").scrollTop > 4); });
  $("#capsule").addEventListener("click", () => { S.pop = "status"; renderOverlay(); });

  document.querySelectorAll("[data-review]").forEach((btn) => btn.addEventListener("click", () => {
    const [k, v] = btn.dataset.review.split(":");
    if (k === "theme") S.theme = v;
    if (k === "platform") S.platform = v;
    if (k === "size") S.size = v;
    if (k === "scenario") applyScenario(v);
    if (k === "view") S.view = v;
    if (k === "motion") document.documentElement.dataset.motion = btn.classList.toggle("on") ? "reduce" : "";
    document.querySelectorAll(`[data-review^="${k}:"]`).forEach((b) => b.classList.toggle("on", b === btn));
    render();
  }));

  setInterval(() => { S.tick = "刚刚"; if (S.page === "calls" && !S.drawer) { const el = $(".chip.ok"); if (el) el.lastChild.textContent = " 实时 · " + new Date().toLocaleTimeString("zh-CN", { hour12: false }); } }, 2000);

  applyScenario("normal");
  render();
})();
