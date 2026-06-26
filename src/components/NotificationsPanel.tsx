"use client";

import { useState } from "react";
import { dismissNotification } from "@/app/admin/actions";

const TYPE_LABELS: Record<string, { text: string; cls: string }> = {
  safe: { text: "✅ A salvo", cls: "bg-emerald-50 text-emerald-700 border-emerald-200" },
  found: { text: "✅ Encontrado", cls: "bg-emerald-50 text-emerald-700 border-emerald-200" },
  merged: { text: "🔄 Resuelto", cls: "bg-blue-50 text-blue-700 border-blue-200" },
  consolidated: { text: "🔄 Consolidado", cls: "bg-blue-50 text-blue-700 border-blue-200" },
};

export default function NotificationsPanel({
  notifications: initial,
}: {
  notifications: { id: string; type: string; message: string; read: boolean; created_at: string }[];
}) {
  const [items, setItems] = useState(initial);

  async function dismiss(id: string) {
    const res = await dismissNotification(id);
    if (res.ok) setItems((prev) => prev.filter((n) => n.id !== id));
  }

  if (items.length === 0) return null;

  return (
    <div className="mt-4 space-y-2">
      <h2 className="text-sm font-semibold text-[#14212e]">Notificaciones</h2>
      {items.map((n) => {
        const label = TYPE_LABELS[n.type] ?? { text: n.type, cls: "bg-slate-50 text-slate-600 border-slate-200" };
        return (
          <div key={n.id} className={`flex items-start gap-3 rounded-xl border p-3 text-sm ${label.cls} ${n.read ? "opacity-60" : ""}`}>
            <div className="min-w-0 flex-1">
              <span className="font-semibold">{label.text}</span>
              <p className="mt-0.5 text-xs opacity-80">{n.message}</p>
            </div>
            <button type="button" onClick={() => dismiss(n.id)}
              className="shrink-0 rounded-lg px-2 py-1 text-xs font-medium opacity-60 hover:opacity-100">✗</button>
          </div>
        );
      })}
    </div>
  );
}
