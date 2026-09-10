import { useEffect, useState } from "react";
import { api } from "../api.ts";

type AuditPageProps = { onError: (message: string) => void };

export function AuditPage({ onError }: AuditPageProps) {
  const [items, setItems] = useState<Awaited<ReturnType<typeof api.audit>>["items"]>([]);

  useEffect(() => {
    api
      .audit()
      .then((data) => setItems(data.items))
      .catch((error: Error) => onError(error.message));
  }, [onError]);

  return (
    <section>
      <div className="page-head">
        <div>
          <h1>审计日志</h1>
          <p>登录成败与广告 / 版本变更会留痕，最多 100 条。</p>
        </div>
      </div>
      <div className="card" style={{ padding: 20 }}>
        <table className="table">
          <thead>
            <tr>
              <th>时间</th>
              <th>动作</th>
              <th>操作者</th>
              <th>详情</th>
              <th>IP</th>
            </tr>
          </thead>
          <tbody>
            {items.map((row) => (
              <tr key={row.id}>
                <td className="mono">{row.created_at}</td>
                <td className="mono">{row.action}</td>
                <td>{row.actor}</td>
                <td>{row.detail}</td>
                <td className="mono">{row.ip}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
