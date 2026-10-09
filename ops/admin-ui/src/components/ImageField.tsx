import { useRef, useState } from "react";
import { api } from "../api.ts";
import { Field, TextInput } from "./Field.tsx";

const ACCEPT = "image/png,image/jpeg,image/gif,image/webp,image/avif";
const MAX_BYTES = 10 * 1024 * 1024;

type ImageFieldProps = {
  label: string;
  value: string;
  onChange: (url: string) => void;
  onError: (message: string) => void;
};

export function ImageField({ label, value, onChange, onError }: ImageFieldProps) {
  const fileInput = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  async function upload(file: File) {
    if (file.size > MAX_BYTES) {
      onError("图片不能超过 10 MiB");
      return;
    }
    setUploading(true);
    try {
      const { path } = await api.uploadImage(file);
      onChange(new URL(path, window.location.origin).href);
    } catch (error) {
      onError(error instanceof Error ? error.message : "上传失败");
    } finally {
      setUploading(false);
    }
  }

  return (
    <Field label={label}>
      <div className="image-field">
        <TextInput
          value={value}
          placeholder="https://… 或上传图片"
          onChange={(event) => onChange(event.target.value)}
        />
        <button
          className="ghost"
          type="button"
          disabled={uploading}
          onClick={() => fileInput.current?.click()}
        >
          {uploading ? "上传中…" : "上传图片"}
        </button>
        <input
          ref={fileInput}
          type="file"
          accept={ACCEPT}
          hidden
          onChange={(event) => {
            const file = event.target.files?.[0];
            event.target.value = "";
            if (file) {
              void upload(file);
            }
          }}
        />
      </div>
    </Field>
  );
}
