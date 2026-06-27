import Link from "next/link";

export default function MergeTabs({ active }: { active: "pendientes" | "revisados" }) {
  return (
    <div className="flex gap-1 rounded-xl bg-slate-100 p-1">
      <Link
        href="/admin/duplicados"
        className={`rounded-lg px-4 py-2 text-sm font-medium transition ${
          active === "pendientes"
            ? "bg-white text-[#14212e] shadow-sm"
            : "text-[#5b6b7b] hover:text-[#14212e]"
        }`}
      >
        Pendientes
      </Link>
      <Link
        href="/admin/duplicados/revisados"
        className={`rounded-lg px-4 py-2 text-sm font-medium transition ${
          active === "revisados"
            ? "bg-white text-[#14212e] shadow-sm"
            : "text-[#5b6b7b] hover:text-[#14212e]"
        }`}
      >
        Revisados
      </Link>
    </div>
  );
}
