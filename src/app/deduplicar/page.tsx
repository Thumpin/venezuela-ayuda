import type { Metadata } from "next";
import Header from "@/components/Header";
import DedupeConsole from "@/components/dedupe/DedupeConsole";

export const metadata: Metadata = {
  title: "Deduplicar registros · Venezuela Ayuda",
  description:
    "Consola de revisión para confirmar o descartar registros duplicados de personas reportadas.",
  robots: { index: false, follow: false },
};

// Operational tool: the working surface (the review console) is the page.
// Wide layout, no marketing hero — just orientation + the queue/detail split.
export default function DeduplicarPage() {
  return (
    <>
      <Header />
      <main id="contenido" className="mx-auto w-full max-w-7xl flex-1 px-3 py-3 sm:px-4 sm:py-4">
        <div className="mb-2 sm:mb-3">
          <h1 className="text-lg font-extrabold text-[#14212e] sm:text-xl">
            Deduplicar registros
          </h1>
          {/* Intro hidden on phones to give the console more vertical room. */}
          <p className="hidden text-sm text-[#5b6b7b] sm:block">
            Revisa cada grupo y confirma qué reportes son la misma persona. Al
            decidir todos los pares de un grupo, pasamos al siguiente.
          </p>
        </div>
        <DedupeConsole />
      </main>
    </>
  );
}
