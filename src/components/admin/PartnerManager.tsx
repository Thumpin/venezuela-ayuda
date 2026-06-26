"use client";

import { useState } from "react";
import { createPartner, revokePartner } from "@/app/admin/actions";
import { fullDate } from "@/lib/format";
import type { PartnerRow } from "@/lib/admin";

export default function PartnerManager({ partners }: { partners: PartnerRow[] }) {
  const [name, setName] = useState("");
  const [source, setSource] = useState("");
  const [contact, setContact] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [createdKey, setCreatedKey] = useState<string | null>(null);
  const [createdId, setCreatedId] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [copiedId, setCopiedId] = useState(false);

  async function onCreate(e: React.FormEvent) {
    e.preventDefault();
    setPending(true);
    setError(null);
    try {
      const res = await createPartner({ name: name.trim(), source: source.trim(), contact: contact.trim() });
      if (res.ok && res.key) {
        setCreatedKey(res.key); // se muestra una sola vez; no recargamos hasta que la copie
        setCreatedId(res.id ?? null); // el id no es secreto, pero lo mostramos aquí también
        setName("");
        setSource("");
        setContact("");
      } else {
        setError(res.error ?? "No se pudo crear el colaborador.");
      }
    } catch {
      setError("No se pudo crear el colaborador.");
    }
    setPending(false);
  }

  async function onRevoke(id: string) {
    setPending(true);
    setError(null);
    try {
      const res = await revokePartner(id);
      if (res.ok) location.reload();
      else {
        setError(res.error ?? "No se pudo revocar.");
        setPending(false);
      }
    } catch {
      setError("No se pudo revocar.");
      setPending(false);
    }
  }

  // La key recién creada: visible una sola vez.
  if (createdKey) {
    return (
      <div className="rounded-2xl border-2 border-[#2f9e6e] bg-[#eaf3ec] p-5">
        <h2 className="text-base font-bold text-[#1f7a52]">API key creada</h2>
        <p className="mt-1 text-sm text-[#14212e]">
          Cópiala y entrégasela al colaborador. <strong>No se vuelve a mostrar.</strong>
        </p>
        <code className="mt-3 block break-all rounded-xl border border-[#cfe3d6] bg-white p-3 font-mono text-sm text-[#14212e]">
          {createdKey}
        </code>
        <button
          type="button"
          onClick={() => {
            navigator.clipboard?.writeText(createdKey);
            setCopied(true);
          }}
          style={{ backgroundColor: "#2f9e6e" }}
          className="mt-2 rounded-xl px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition active:scale-[0.99]"
        >
          {copied ? "Copiada ✓" : "Copiar key"}
        </button>
        {createdId && (
          <div className="mt-4">
            <p className="text-sm font-medium text-[#14212e]">
              ID del colaborador <span className="font-normal text-[#1f7a52]">(no es secreto)</span>
            </p>
            <code className="mt-1.5 block break-all rounded-xl border border-[#cfe3d6] bg-white p-3 font-mono text-sm text-[#14212e]">
              {createdId}
            </code>
            <button
              type="button"
              onClick={() => {
                navigator.clipboard?.writeText(createdId);
                setCopiedId(true);
              }}
              className="mt-2 rounded-xl border border-[#cfe3d6] px-4 py-2.5 text-sm font-medium text-[#1f7a52] transition hover:bg-white"
            >
              {copiedId ? "ID copiado ✓" : "Copiar ID"}
            </button>
          </div>
        )}
        <div className="mt-4 border-t border-[#cfe3d6] pt-3">
          <button
            type="button"
            onClick={() => location.reload()}
            className="rounded-xl border border-[#cfe3d6] px-4 py-2.5 text-sm font-medium text-[#1f7a52] transition hover:bg-white"
          >
            Listo, ya la copié
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <form onSubmit={onCreate} className="space-y-3 rounded-2xl border border-[#e6ecf2] bg-white p-4">
        <span className="block text-sm font-medium text-[#14212e]">Nuevo colaborador</span>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
          placeholder="Nombre (ej: Cruz Roja)"
          className="w-full rounded-xl border border-[#e6ecf2] px-3.5 py-3 text-base text-[#14212e] outline-none transition focus:border-[#2563a8]"
        />
        <input
          value={source}
          onChange={(e) => setSource(e.target.value)}
          required
          placeholder="Source / identificador (ej: cruzroja.org)"
          className="w-full rounded-xl border border-[#e6ecf2] px-3.5 py-3 text-base text-[#14212e] outline-none transition focus:border-[#2563a8]"
        />
        <input
          value={contact}
          onChange={(e) => setContact(e.target.value)}
          placeholder="Contacto (opcional)"
          className="w-full rounded-xl border border-[#e6ecf2] px-3.5 py-3 text-base text-[#14212e] outline-none transition focus:border-[#2563a8]"
        />
        <button
          type="submit"
          disabled={pending}
          style={{ backgroundColor: "#2563a8" }}
          className="w-full rounded-xl px-5 py-3 text-base font-semibold text-white shadow-sm transition active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-60"
        >
          Crear y generar key
        </button>
        {error && <p className="text-sm font-medium text-red-600">{error}</p>}
      </form>

      <ul className="space-y-2">
        {partners.map((p) => (
          <li
            key={p.id}
            className="flex flex-wrap items-center gap-3 rounded-2xl border border-[#e6ecf2] bg-white p-4"
          >
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold text-[#14212e]">
                {p.name}
                {!p.active && (
                  <span className="ml-2 rounded-md bg-red-50 px-1.5 py-0.5 text-xs font-medium text-red-700">
                    revocada
                  </span>
                )}
              </p>
              <p className="mt-1 truncate text-xs text-[#8190a0]">{p.source}</p>
              <p className="mt-0.5 break-all font-mono text-xs text-[#8190a0]">external_id: {p.id}</p>
              <p className="mt-0.5 truncate text-xs text-[#8190a0]">{fullDate(p.created_at)}</p>
            </div>
            {p.active && (
              <button
                type="button"
                disabled={pending}
                onClick={() => onRevoke(p.id)}
                className="shrink-0 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm font-medium text-red-700 transition hover:bg-red-100 active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-50"
              >
                Revocar
              </button>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
