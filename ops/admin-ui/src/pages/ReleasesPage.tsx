import { useEffect, useState } from "react";
import { api, type ReleaseRecord } from "../api.ts";
import { ConfirmDialog } from "../components/ConfirmDialog.tsx";
import { emptyRelease, fromRelease, ReleaseEditor, type ReleaseDraft } from "./ReleaseEditor.tsx";

const RELEASE_REPOSITORY = "moralmaker/cursor-toosl";

type ReleasesPageProps = { onError: (message: string) => void };

export function ReleasesPage({ onError }: ReleasesPageProps) {
  const [releases, setReleases] = useState<ReleaseRecord[]>([]);
  const [editing, setEditing] = useState<{ version?: string; draft: ReleaseDraft } | null>(null);
  const [pending, setPending] = useState(false);
  const [removing, setRemoving] = useState<ReleaseRecord | null>(null);
  const [repository, setRepository] = useState(RELEASE_REPOSITORY);

  async function refresh() {
    setReleases((await api.releases()).releases);
  }

  useEffect(() => {
    refresh().catch((error: Error) => onError(error.message));
  }, [onError]);

  async function save() {
    if (!editing) {
      return;
    }
    setPending(true);
    try {
      if (editing.version) {
        await api.updateRelease(editing.version, editing.draft);
      } else {
        await api.createRelease(editing.draft);
      }
      setEditing(null);
      await refresh();
    } catch (error) {
      onError(error instanceof Error ? error.message : "保存失败");
    } finally {
      setPending(false);
    }
  }

  async function importGithub() {
    setPending(true);
    try {
      const requested = repository.trim() === "moralmaker/cursor-tools-releases" ? RELEASE_REPOSITORY : repository.trim();
      setRepository(requested);
      await api.importGithub(requested);
      await refresh();
    } catch (error) {
      onError(error instanceof Error ? error.message : "导入失败");
    } finally {
      setPending(false);
    }
  }

  return (
    <section>
      <div className="page-head">
        <div>
          <h1>版本发布</h1>
          <p>输出 Tauri latest.json / portable-latest.json。签名由客户端公钥校验。</p>
        </div>
        <div className="row-actions">
          <input value={repository} onChange={(event) => setRepository(event.target.value)} />
          <button className="ghost" type="button" disabled={pending} onClick={() => void importGithub()}>
            从 GitHub 导入
          </button>
          <button className="primary" type="button" onClick={() => setEditing({ draft: emptyRelease() })}>
            新建版本
          </button>
        </div>
      </div>
      <div className="list">
        {releases.length === 0 ? <div className="card empty">还没有版本记录</div> : null}
        {releases.map((release) => (
          <article className="card row" key={release.version}>
            <div className="badge">{release.published ? "已发布" : "草稿"}</div>
            <div>
              <h3 className="mono">{release.version}</h3>
              <p>{release.changelogTitle || release.notes || "（无说明）"}</p>
              <p className="mono">
                {release.pubDate} · {release.assets.length} 个资产
                {release.changelogVisible ? " · 日志已展示" : ""}
              </p>
            </div>
            <div className="row-actions">
              <button className="ghost" type="button" onClick={() => setEditing({ version: release.version, draft: fromRelease(release) })}>
                编辑
              </button>
              <button className="danger" type="button" onClick={() => setRemoving(release)}>
                删除
              </button>
            </div>
          </article>
        ))}
      </div>
      {editing ? (
        <ReleaseEditor
          title={editing.version ? `编辑 ${editing.version}` : "新建版本"}
          draft={editing.draft}
          versionLocked={Boolean(editing.version)}
          pending={pending}
          onChange={(draft) => setEditing({ ...editing, draft })}
          onCancel={() => setEditing(null)}
          onSave={() => void save()}
        />
      ) : null}
      {removing ? (
        <ConfirmDialog
          title="删除版本"
          message={`确认删除 ${removing.version}？`}
          onCancel={() => setRemoving(null)}
          onConfirm={() => {
            api
              .deleteRelease(removing.version)
              .then(() => refresh())
              .catch((error: Error) => onError(error.message))
              .finally(() => setRemoving(null));
          }}
        />
      ) : null}
    </section>
  );
}
