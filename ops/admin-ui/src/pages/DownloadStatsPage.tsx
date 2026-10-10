import { useCallback, useEffect, useMemo, useState } from "react";
import { api, type DownloadStatsResponse } from "../api.ts";

type DownloadStatsPageProps = { onError: (message: string) => void };

function todayUtc(): string {
  return new Date().toISOString().slice(0, 10);
}

function shiftUtc(day: string, delta: number): string {
  const date = new Date(`${day}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + delta);
  return date.toISOString().slice(0, 10);
}

export function DownloadStatsPage({ onError }: DownloadStatsPageProps) {
  const [to, setTo] = useState(todayUtc);
  const [from, setFrom] = useState(() => shiftUtc(todayUtc(), -29));
  const [data, setData] = useState<DownloadStatsResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [tab, setTab] = useState<"platform" | "asset">("platform");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setData(await api.downloadStats(from, to));
    } catch (error) {
      onError(error instanceof Error ? error.message : "加载失败");
    } finally {
      setLoading(false);
    }
  }, [from, to, onError]);

  useEffect(() => {
    void load();
  }, [load]);

  const maxDay = useMemo(
    () => Math.max(1, ...(data?.byDay.map((row) => row.count) ?? [1])),
    [data],
  );

  return (
    <section>
      <div className="page-head">
        <div>
          <h1>下载统计</h1>
          <p>统计经 ops R2（/api/v1/updates/assets/*）成功下发的安装包，不含签名与清单。</p>
        </div>
        <div className="row-actions">
          <input type="date" value={from} onChange={(event) => setFrom(event.target.value)} />
          <input type="date" value={to} onChange={(event) => setTo(event.target.value)} />
          <button className="ghost" type="button" disabled={loading} onClick={() => void load()}>
            {loading ? "加载中…" : "刷新"}
          </button>
        </div>
      </div>

      <div className="stat-grid">
        <div className="card stat-card">
          <small>今日</small>
          <strong>{data?.today ?? "—"}</strong>
        </div>
        <div className="card stat-card">
          <small>近 7 日</small>
          <strong>{data?.last7Days ?? "—"}</strong>
        </div>
        <div className="card stat-card">
          <small>近 30 日</small>
          <strong>{data?.last30Days ?? "—"}</strong>
        </div>
        <div className="card stat-card">
          <small>所选区间</small>
          <strong>{data?.totals.downloads ?? "—"}</strong>
        </div>
      </div>

      <div className="card" style={{ padding: 20, marginBottom: 20 }}>
        <h2 style={{ margin: "0 0 16px", fontSize: 18 }}>按日趋势</h2>
        <div className="bar-chart" aria-label="按日下载量">
          {(data?.byDay ?? []).map((row) => (
            <div className="bar-col" key={row.day} title={`${row.day}: ${row.count}`}>
              <div className="bar" style={{ height: `${Math.max(4, (row.count / maxDay) * 100)}%` }} />
              <span>{row.count}</span>
              <small>{row.day.slice(5)}</small>
            </div>
          ))}
          {!data?.byDay.length ? <p style={{ color: "var(--muted)" }}>暂无数据</p> : null}
        </div>
      </div>

      <div className="card" style={{ padding: 20, marginBottom: 20 }}>
        <h2 style={{ margin: "0 0 16px", fontSize: 18 }}>按版本</h2>
        <table className="table">
          <thead>
            <tr>
              <th>版本</th>
              <th>下载次数</th>
            </tr>
          </thead>
          <tbody>
            {(data?.byVersion ?? []).map((row) => (
              <tr key={row.version}>
                <td className="mono">{row.version}</td>
                <td>{row.count}</td>
              </tr>
            ))}
            {!data?.byVersion.length ? (
              <tr>
                <td colSpan={2} style={{ color: "var(--muted)" }}>
                  暂无数据
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>

      <div className="card" style={{ padding: 20 }}>
        <div className="page-head" style={{ marginBottom: 12 }}>
          <h2 style={{ margin: 0, fontSize: 18 }}>{tab === "platform" ? "按平台" : "按文件"}</h2>
          <div className="row-actions">
            <button
              className={tab === "platform" ? "" : "ghost"}
              type="button"
              onClick={() => setTab("platform")}
            >
              平台
            </button>
            <button className={tab === "asset" ? "" : "ghost"} type="button" onClick={() => setTab("asset")}>
              文件
            </button>
          </div>
        </div>
        {tab === "platform" ? (
          <table className="table">
            <thead>
              <tr>
                <th>平台</th>
                <th>下载次数</th>
              </tr>
            </thead>
            <tbody>
              {(data?.byPlatform ?? []).map((row) => (
                <tr key={row.platform}>
                  <td className="mono">{row.platform}</td>
                  <td>{row.count}</td>
                </tr>
              ))}
              {!data?.byPlatform.length ? (
                <tr>
                  <td colSpan={2} style={{ color: "var(--muted)" }}>
                    暂无数据
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th>文件</th>
                <th>版本</th>
                <th>平台</th>
                <th>通道</th>
                <th>次数</th>
              </tr>
            </thead>
            <tbody>
              {(data?.byAsset ?? []).map((row) => (
                <tr key={row.assetName}>
                  <td className="mono">{row.assetName}</td>
                  <td className="mono">{row.version}</td>
                  <td className="mono">{row.platform}</td>
                  <td>{row.channel}</td>
                  <td>{row.count}</td>
                </tr>
              ))}
              {!data?.byAsset.length ? (
                <tr>
                  <td colSpan={5} style={{ color: "var(--muted)" }}>
                    暂无数据
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        )}
      </div>
    </section>
  );
}
