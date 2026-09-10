import { useState, type FormEvent } from "react";
import { ApiError, api } from "../api.ts";

type LoginPageProps = {
  onLoggedIn: () => void;
};

export function LoginPage({ onLoggedIn }: LoginPageProps) {
  const [username, setUsername] = useState("admin");
  const [password, setPassword] = useState("");
  const [totp, setTotp] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setPending(true);
    setError(null);
    try {
      await api.login({
        username,
        password,
        totp: totp.trim() ? totp.trim() : undefined,
      });
      onLoggedIn();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "登录失败");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="login-wrap">
      <div className="login-card">
        <h1>运营台</h1>
        <p>广告位与桌面更新清单。会话 Cookie 仅同源可用。</p>
        <form onSubmit={onSubmit}>
          <label>
            用户名
            <input value={username} onChange={(event) => setUsername(event.target.value)} autoComplete="username" />
          </label>
          <label>
            密码
            <input
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              autoComplete="current-password"
            />
          </label>
          <label>
            TOTP（若已开启）
            <input
              className="mono"
              value={totp}
              onChange={(event) => setTotp(event.target.value)}
              inputMode="numeric"
              autoComplete="one-time-code"
            />
          </label>
          {error ? <p style={{ color: "var(--danger)" }}>{error}</p> : null}
          <button className="primary" type="submit" disabled={pending}>
            {pending ? "验证中…" : "进入"}
          </button>
        </form>
      </div>
    </div>
  );
}
