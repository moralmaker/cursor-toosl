import type { ReleaseAsset, ReleaseRecord } from "../api.ts";
import { Field, Select, TextArea, TextInput } from "../components/Field.tsx";

export type ReleaseDraft = {
  version: string;
  notes: string;
  pubDate: string;
  published: boolean;
  assets: ReleaseAsset[];
};

export function emptyRelease(): ReleaseDraft {
  return {
    version: "",
    notes: "",
    pubDate: new Date().toISOString(),
    published: false,
    assets: [],
  };
}

export function fromRelease(release: ReleaseRecord): ReleaseDraft {
  return {
    version: release.version,
    notes: release.notes,
    pubDate: release.pubDate,
    published: release.published,
    assets: release.assets,
  };
}

const PLATFORMS = [
  "darwin-aarch64",
  "darwin-x86_64",
  "linux-x86_64",
  "windows-x86_64",
  "windows-x86_64-nsis",
  "windows-x86_64-msi",
  "darwin-aarch64-app",
  "linux-x86_64-appimage",
  "linux-x86_64-deb",
  "linux-x86_64-rpm",
];

type ReleaseEditorProps = {
  title: string;
  draft: ReleaseDraft;
  versionLocked: boolean;
  pending: boolean;
  onChange: (draft: ReleaseDraft) => void;
  onCancel: () => void;
  onSave: () => void;
};

export function ReleaseEditor({
  title,
  draft,
  versionLocked,
  pending,
  onChange,
  onCancel,
  onSave,
}: ReleaseEditorProps) {
  function patchAsset(index: number, partial: Partial<ReleaseAsset>) {
    onChange({
      ...draft,
      assets: draft.assets.map((asset, i) => (i === index ? { ...asset, ...partial } : asset)),
    });
  }

  return (
    <div className="overlay">
      <div className="modal">
        <div className="modal-head">
          <h2>{title}</h2>
          <button className="ghost" type="button" onClick={onCancel}>
            关闭
          </button>
        </div>
        <div className="fields">
          <div className="inline">
            <Field label="版本">
              <TextInput
                className="mono"
                value={draft.version}
                disabled={versionLocked}
                onChange={(event) => onChange({ ...draft, version: event.target.value })}
              />
            </Field>
            <Field label="发布时间">
              <TextInput
                value={draft.pubDate}
                onChange={(event) => onChange({ ...draft, pubDate: event.target.value })}
              />
            </Field>
          </div>
          <label className="checks" style={{ flexDirection: "row" }}>
            <input
              type="checkbox"
              checked={draft.published}
              onChange={(event) => onChange({ ...draft, published: event.target.checked })}
            />
            已发布（客户端可见）
          </label>
          <Field label="更新说明">
            <TextArea value={draft.notes} onChange={(event) => onChange({ ...draft, notes: event.target.value })} />
          </Field>
          <div className="toolbar">
            <strong>平台资产</strong>
            <button
              className="ghost"
              type="button"
              onClick={() =>
                onChange({
                  ...draft,
                  assets: [
                    ...draft.assets,
                    { kind: "installer", platform: "darwin-aarch64", url: "", signature: "" },
                  ],
                })
              }
            >
              添加资产
            </button>
          </div>
          <table className="table">
            <thead>
              <tr>
                <th>类型</th>
                <th>平台</th>
                <th>URL</th>
                <th>minisign 签名</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {draft.assets.map((asset, index) => (
                <tr key={`${asset.kind}-${asset.platform}-${index}`}>
                  <td>
                    <Select
                      value={asset.kind}
                      onChange={(event) =>
                        patchAsset(index, { kind: event.target.value as ReleaseAsset["kind"] })
                      }
                    >
                      <option value="installer">installer</option>
                      <option value="portable">portable</option>
                    </Select>
                  </td>
                  <td>
                    <Select
                      value={asset.platform}
                      onChange={(event) => patchAsset(index, { platform: event.target.value })}
                    >
                      {PLATFORMS.map((platform) => (
                        <option key={platform} value={platform}>
                          {platform}
                        </option>
                      ))}
                    </Select>
                  </td>
                  <td>
                    <TextInput value={asset.url} onChange={(event) => patchAsset(index, { url: event.target.value })} />
                  </td>
                  <td>
                    <TextArea
                      value={asset.signature}
                      onChange={(event) => patchAsset(index, { signature: event.target.value })}
                    />
                  </td>
                  <td>
                    <button
                      className="ghost"
                      type="button"
                      onClick={() =>
                        onChange({ ...draft, assets: draft.assets.filter((_, i) => i !== index) })
                      }
                    >
                      删除
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="modal-actions">
          <button className="ghost" type="button" onClick={onCancel}>
            取消
          </button>
          <button className="primary" type="button" disabled={pending} onClick={onSave}>
            {pending ? "保存中…" : "保存"}
          </button>
        </div>
      </div>
    </div>
  );
}
