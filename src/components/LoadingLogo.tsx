// General loading state: the main logo "beating" (heartbeat pulse). Used by the
// route-level loading.tsx; reusable anywhere a full-area loading state is needed.
export default function LoadingLogo({ label = "Cargando…" }: { label?: string }) {
  return (
    <div
      role="status"
      aria-live="polite"
      className="flex flex-1 flex-col items-center justify-center gap-4 py-24"
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/logo.webp"
        alt=""
        aria-hidden
        width={72}
        height={72}
        className="h-[72px] w-[72px] rounded-[18px] animate-heartbeat"
      />
      <span className="text-sm font-medium text-slate-500">{label}</span>
    </div>
  );
}
