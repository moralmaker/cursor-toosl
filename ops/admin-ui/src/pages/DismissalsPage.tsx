import { useEffect, useState } from "react";
import { api } from "../api.ts";

type DismissalsPageProps = { onError: (message: string) => void };

export function DismissalsPage({ onError }: DismissalsPageProps) {
  const [adId, setAdId] = useState("");
  const [data, setData] = useState<Awaited<ReturnType<typeof api.dismissals>> | null>(null);

  async function refresh(id?: string) {
    setData(await api.dismissals(id || undefined));
  }

  useEffect(() => {
    refresh().catch((error: Error) => onError(error.message));
  }, [onError]);

  return (
    <section>
      <div className="page-head">
        <div>
          <h1>关闭反馈</h1>
          <p>同一设备对同一广告只保留最近一次原因。</p>
        </div>
        <div className="row-actions">
          <input
            className="mono"
            placeholder="按广告 ID 过滤"
            value={adId}
            onChange={(event) => setAdId(event.target.value)}
          />
          <button className="ghost" type="button" onClick={() => void refresh(adId.trim())}>
            查询
          </button>
        </div>
      </div>
      <div className="card" style={{ padding: 20, marginBottom: 20 }}>
        <table className="table">
          <thead>
            <tr>
              <th>广告</th>
              <th>次数</th>
              <th>最近原因</th>
              <th>时间</th>
            </tr>
          </thead>
          <tbody>
            {(data?.summary ?? []).map((row) => (
              <tr key={row.adId}>
                <td className="mono">{row.adId}</td>
                <td>{row.count}</td>
                <td>{row.lastReason}</td>
                <td className="mono">{row.lastAt}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="card" style={{ padding: 20 }}>
        <table className="table">
          <thead>
            <tr>
              <th>广告</th>
              <th>设备</th>
              <th>系统</th>
              <th>版本</th>
              <th>原因</th>
              <th>更新时间</th>
            </tr>
          </thead>
          <tbody>
            {(data?.items ?? []).map((row) => (
              <tr key={`${row.ad_id}-${row.device_id}`}>
                <td className="mono">{row.ad_id}</td>
                <td className="mono">{row.device_id}</td>
                <td>{row.os}</td>
                <td>{row.app_version}</td>
                <td>{row.reason}</td>
                <td className="mono">{row.updated_at}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
