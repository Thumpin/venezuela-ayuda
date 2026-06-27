"use client";

import { useState } from "react";
import { addAdmin, removeAdmin, setSuperAdmin } from "@/app/admin/actions";
import { fullDate } from "@/lib/format";
import type { AdminRow } from "@/lib/admin";

export default function AdminManager({
  admins,
  currentEmail,
}: {
  admins: AdminRow[];
  currentEmail: string;
}) {
  const [email, setEmail] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run(fn: () => Promise<{ ok: boolean; error?: string }>) {
    setPending(true);
    setError(null);
    try {
      const res = await fn();
      if (res.ok) {
        location.reload();
      } else {
        setError(res.error ?? "No se pudo completar la acción.");
        setPending(false);
      }
    } catch {
      setError("No se pudo completar la acción.");
      setPending(false);
    }
  }

  function onAdd(e: React.FormEvent) {
    e.preventDefault();
    const clean = email.trim();
    if (!clean) return;
    run(() => addAdmin(clean));
  }

  return (
    <div className="space-y-5">
      <form
        onSubmit={onAdd}
        className="rounded-2xl border border-[#e6ecf2] bg-white p-4"
      >
        <label className="block">
          <span className="mb-1.5 block text-sm font-medium text-[#14212e]">
            Agregar administrador
          </span>
          <div className="flex flex-wrap gap-2">
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              placeholder="correo@ejemplo.com"
              className="min-w-0 flex-1 rounded-xl border border-[#e6ecf2] px-3.5 py-3 text-base text-[#14212e] outline-none transition focus:border-[#2563a8]"
            />
            <button
              type="submit"
              disabled={pending}
              style={{ backgroundColor: "#2563a8" }}
              className="shrink-0 rounded-xl px-5 py-3 text-base font-semibold text-white shadow-sm transition active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-60"
            >
              Agregar
            </button>
          </div>
        </label>
        {error && (
          <p className="mt-2.5 text-sm font-medium text-red-600">{error}</p>
        )}
      </form>

      <ul className="space-y-2">
        {admins.map((admin) => {
          const isMe = admin.email === currentEmail;
          return (
            <li
              key={admin.email}
              className="flex flex-wrap items-center gap-3 rounded-2xl border border-[#e6ecf2] bg-white p-4"
            >
              <div className="min-w-0 flex-1">
                <p className="flex items-center gap-2 truncate text-sm font-semibold text-[#14212e]">
                  {admin.email}
                  {admin.is_super_admin && (
                    <span className="rounded-full bg-violet-100 px-2 py-0.5 text-[11px] font-bold text-violet-700">
                      super
                    </span>
                  )}
                  {isMe && (
                    <span className="text-xs font-normal text-[#8190a0]">(tú)</span>
                  )}
                </p>
                <p className="mt-0.5 text-xs text-[#8190a0]">
                  Agregado {fullDate(admin.created_at)}
                  {admin.added_by ? ` · por ${admin.added_by}` : ""}
                </p>
              </div>
              <button
                type="button"
                disabled={pending || (isMe && admin.is_super_admin)}
                onClick={() => run(() => setSuperAdmin(admin.email, !admin.is_super_admin))}
                className="shrink-0 rounded-lg border border-violet-200 bg-violet-50 px-3 py-2 text-sm font-medium text-violet-700 transition hover:bg-violet-100 active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-50"
              >
                {admin.is_super_admin ? "Quitar super" : "Hacer super"}
              </button>
              <button
                type="button"
                disabled={pending || isMe}
                onClick={() => run(() => removeAdmin(admin.email))}
                className="shrink-0 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm font-medium text-red-700 transition hover:bg-red-100 active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-50"
              >
                Quitar
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
