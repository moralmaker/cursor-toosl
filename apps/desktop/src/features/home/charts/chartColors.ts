import { useEffect, useState } from "react";

export type ChartColors = {
  input: string;
  cache: string;
  write: string;
  output: string;
  ink: string;
};

const fallback: ChartColors = {
  input: "#4aa8ff",
  cache: "#35d0e0",
  write: "#7c8cff",
  output: "#f5b94a",
  ink: "#a3adbd",
};

export function readChartColors(): ChartColors {
  const style = getComputedStyle(document.documentElement);
  const pick = (name: string, value: string) => style.getPropertyValue(name).trim() || value;
  return {
    input: pick("--oa-chart-input", fallback.input),
    cache: pick("--oa-chart-cache", fallback.cache),
    write: pick("--oa-chart-write", fallback.write),
    output: pick("--oa-chart-output", fallback.output),
    ink: pick("--vscode-descriptionForeground", fallback.ink),
  };
}

export function withAlpha(color: string, alpha: number) {
  const match = /^#([\da-f]{6})$/i.exec(color.trim());
  if (!match) return color;
  const value = match[1];
  const red = parseInt(value.slice(0, 2), 16);
  const green = parseInt(value.slice(2, 4), 16);
  const blue = parseInt(value.slice(4, 6), 16);
  return `rgba(${red}, ${green}, ${blue}, ${alpha})`;
}

export function useChartColors() {
  const [colors, setColors] = useState(readChartColors);
  useEffect(() => {
    const update = () => setColors(readChartColors());
    const observer = new MutationObserver(update);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    update();
    return () => observer.disconnect();
  }, []);
  return colors;
}
