"use client";

import { useState } from "react";
import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { adminSignIn, adminSignUp, type AuthState } from "@/app/admin/actions";

function SubmitBtn({ children }: { children: React.ReactNode }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      aria-busy={pending}
      style={{ backgroundColor: "#2563a8" }}
      className="flex min-h-[52px] w-full items-center justify-center gap-2 rounded-[15px] px-5 py-3.5 text-base font-semibold text-white shadow-sm transition active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-60"
    >
      {pending && (
        <span
          aria-hidden
          className="h-5 w-5 animate-spin rounded-full border-2 border-white/40 border-t-white"
        />
      )}
      {pending ? "Procesando…" : children}
    </button>
  );
}

const TABS = [
  { key: "signin", label: "Iniciar sesión" },
  { key: "signup", label: "Primera vez (crear contraseña)" },
] as const;

type TabKey = (typeof TABS)[number]["key"];

export default function AdminLogin() {
  const [tab, setTab] = useState<TabKey>("signin");
  const [signInState, signInAction] = useActionState<AuthState, FormData>(
    adminSignIn,
    {},
  );
  const [signUpState, signUpAction] = useActionState<AuthState, FormData>(
    adminSignUp,
    {},
  );

  const isSignIn = tab === "signin";
  const action = isSignIn ? signInAction : signUpAction;
  const state = isSignIn ? signInState : signUpState;

  return (
    <div className="rounded-2xl border border-[#e6ecf2] bg-white p-6 shadow-sm">
      <h1 className="text-xl font-bold text-[#14212e]">
        Panel de administración
      </h1>
      <p className="mt-1 text-sm text-[#5b6b7b]">
        Solo administradores autorizados.
      </p>

      <div className="mt-5 grid grid-cols-2 gap-1 rounded-xl bg-slate-100 p-1">
        {TABS.map((t) => {
          const active = tab === t.key;
          return (
            <button
              key={t.key}
              type="button"
              onClick={() => setTab(t.key)}
              aria-pressed={active}
              className={`rounded-lg px-2 py-2 text-xs font-semibold transition ${
                active
                  ? "bg-white text-[#14212e] shadow-sm"
                  : "text-[#5b6b7b] hover:text-[#14212e]"
              }`}
            >
              {t.label}
            </button>
          );
        })}
      </div>

      <form key={tab} action={action} className="mt-5 space-y-4">
        {state.error && (
          <div
            role="alert"
            className="rounded-xl border border-red-200 bg-red-50 px-3.5 py-2.5 text-sm font-medium text-red-700"
          >
            {state.error}
          </div>
        )}

        <label className="block">
          <span className="mb-1.5 block text-sm font-medium text-[#14212e]">
            Correo
          </span>
          <input
            type="email"
            name="email"
            required
            autoComplete="email"
            placeholder="tu@correo.com"
            className="w-full rounded-xl border border-[#e6ecf2] px-3.5 py-3 text-base text-[#14212e] outline-none transition focus:border-[#2563a8]"
          />
        </label>

        <label className="block">
          <span className="mb-1.5 block text-sm font-medium text-[#14212e]">
            Contraseña
          </span>
          <input
            type="password"
            name="password"
            required
            autoComplete={isSignIn ? "current-password" : "new-password"}
            minLength={isSignIn ? undefined : 12}
            placeholder={isSignIn ? "••••••••" : "Mínimo 12 caracteres"}
            className="w-full rounded-xl border border-[#e6ecf2] px-3.5 py-3 text-base text-[#14212e] outline-none transition focus:border-[#2563a8]"
          />
        </label>

        <SubmitBtn>{isSignIn ? "Entrar" : "Crear contraseña"}</SubmitBtn>
      </form>
    </div>
  );
}
