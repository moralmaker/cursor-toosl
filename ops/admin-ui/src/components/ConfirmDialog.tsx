type ConfirmDialogProps = {
  title: string;
  message: string;
  onCancel: () => void;
  onConfirm: () => void;
};

export function ConfirmDialog({ title, message, onCancel, onConfirm }: ConfirmDialogProps) {
  return (
    <div className="overlay" role="dialog" aria-modal="true">
      <div className="modal" style={{ width: 420 }}>
        <div className="modal-head">
          <h2>{title}</h2>
        </div>
        <p style={{ padding: "0 20px", color: "var(--muted)" }}>{message}</p>
        <div className="modal-actions">
          <button className="ghost" type="button" onClick={onCancel}>
            取消
          </button>
          <button className="danger" type="button" onClick={onConfirm}>
            确认删除
          </button>
        </div>
      </div>
    </div>
  );
}
