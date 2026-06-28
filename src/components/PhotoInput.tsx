"use client";

import { useRef, useState } from "react";
import { useTranslations } from "next-intl";

// Optional photo picker. Downscales the image IN THE BROWSER before it ever
// touches the network — a 4 MB phone photo becomes ~150-300 KB, which matters on
// 2G. The result is a JPEG data URL placed in a hidden field; the server decodes
// and uploads it to Storage.
const MAX_DIM = 1200;
const QUALITY = 0.6;

function loadImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("No se pudo leer la imagen."));
    };
    img.src = url;
  });
}

async function downscale(file: File): Promise<string> {
  const img = await loadImage(file);
  let { width, height } = img;
  if (width > height && width > MAX_DIM) {
    height = Math.round((height * MAX_DIM) / width);
    width = MAX_DIM;
  } else if (height >= width && height > MAX_DIM) {
    width = Math.round((width * MAX_DIM) / height);
    height = MAX_DIM;
  }
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("No se pudo procesar la imagen.");
  ctx.drawImage(img, 0, 0, width, height);
  return canvas.toDataURL("image/jpeg", QUALITY);
}

export default function PhotoInput({
  label,
  onPhoto,
}: {
  label?: string;
  // Notifica al formulario el data URL elegido (o null al quitarlo). Lo usa el
  // anti-duplicado por rostro al registrar a una persona.
  onPhoto?: (dataUrl: string | null) => void;
}) {
  const t = useTranslations("forms.photo");
  const [preview, setPreview] = useState<string>("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const labelText = label ?? t("defaultLabel");

  async function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setBusy(true);
    setError(null);
    try {
      const dataUrl = await downscale(file);
      setPreview(dataUrl);
      onPhoto?.(dataUrl);
    } catch {
      setError(t("processError"));
      setPreview("");
      onPhoto?.(null);
    } finally {
      setBusy(false);
    }
  }

  function clear() {
    setPreview("");
    setError(null);
    if (fileRef.current) fileRef.current.value = "";
    onPhoto?.(null);
  }

  return (
    <div>
      <span className="mb-1.5 block font-semibold text-slate-800">{labelText}</span>

      {/* Hidden field the server reads. */}
      <input type="hidden" name="photo_data" value={preview} readOnly />

      {!preview ? (
        <label className="inline-flex cursor-pointer items-center gap-2 rounded-xl bg-slate-100 px-4 py-3 font-semibold text-slate-700 active:scale-[0.99]">
          <span aria-hidden>📷</span>
          {busy ? t("processing") : t("add")}
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            onChange={onPick}
            className="sr-only"
          />
        </label>
      ) : (
        <div className="flex items-start gap-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={preview}
            alt={t("preview")}
            className="h-24 w-24 rounded-xl object-cover ring-1 ring-slate-300"
          />
          <button
            type="button"
            onClick={clear}
            className="rounded-xl bg-slate-100 px-3 py-2 text-sm font-semibold text-slate-700"
          >
            {t("remove")}
          </button>
        </div>
      )}

      {error && <p className="mt-1 text-sm text-amber-700">{error}</p>}
      <p className="mt-1 text-sm text-slate-500">{t("note")}</p>
    </div>
  );
}
