window.Charts = (function () {
  const live = [];
  function css(name) {
    return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  }
  function dispose() {
    live.splice(0).forEach((c) => c.dispose());
  }
  function bar(el) {
    if (!window.echarts || !el) return;
    const chart = echarts.init(el, null, { renderer: "canvas" });
    live.push(chart);
    const rows = DATA.series;
    const ink = css("--ink-3") || "#6b7588";
    const line = css("--line") || "rgba(148,163,184,.1)";
    chart.setOption({
      animationDuration: 400,
      grid: { left: 36, right: 8, top: 16, bottom: 28 },
      tooltip: { trigger: "axis", axisPointer: { type: "shadow" } },
      xAxis: { type: "category", data: rows.map((r) => r.t), axisLabel: { color: ink, fontSize: 11 }, axisLine: { lineStyle: { color: line } } },
      yAxis: { type: "value", axisLabel: { color: ink, fontSize: 11 }, splitLine: { lineStyle: { color: line } } },
      series: [
        { name: "输入（非缓存）", type: "bar", stack: "t", data: rows.map((r) => r.input), itemStyle: { color: css("--chart-in") }, barWidth: 8 },
        { name: "缓存输入", type: "bar", stack: "t", data: rows.map((r) => r.cache), itemStyle: { color: css("--chart-cache") } },
        { name: "缓存写入", type: "bar", stack: "t", data: rows.map((r) => r.write), itemStyle: { color: css("--chart-write") } },
        { name: "模型输出", type: "bar", stack: "t", data: rows.map((r) => r.output), itemStyle: { color: css("--chart-out") } },
      ],
    });
  }
  function gauge(el, value) {
    if (!window.echarts || !el) return;
    const chart = echarts.init(el, null, { renderer: "canvas" });
    live.push(chart);
    chart.setOption({
      series: [{
        type: "gauge", startAngle: 200, endAngle: -20, min: 0, max: 100,
        radius: "100%", center: ["50%", "70%"],
        progress: { show: true, width: 8, itemStyle: { color: css("--chart-cache") } },
        axisLine: { lineStyle: { width: 8, color: [[1, css("--bg-input") || "#1b2230"]] } },
        axisTick: { show: false }, splitLine: { show: false }, axisLabel: { show: false },
        pointer: { show: false }, anchor: { show: false },
        detail: { valueAnimation: true, formatter: "{value}%", color: css("--ink"), fontSize: 18, offsetCenter: [0, 0] },
        data: [{ value }],
      }],
    });
  }
  function mount() {
    dispose();
    document.querySelectorAll("[data-chart]").forEach((el) => {
      if (el.dataset.chart === "bar") bar(el);
      if (el.dataset.chart === "gauge") gauge(el, Number(el.dataset.value || 99));
    });
  }
  window.addEventListener("resize", () => live.forEach((c) => c.resize()));
  return { mount, dispose };
})();
