"use client";

import { useState } from "react";

// Adds the visitor's coordinates to the current URL so the server re-renders the
// list sorted by distance (within each urgency tier). No coords are stored.
export default function UseMyLocationButton({ label, locating }: { label: string; locating: string }) {
  const [busy, setBusy] = useState(false);

  function onClick() {
    if (!navigator.geolocation) return;
    setBusy(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const url = new URL(window.location.href);
        url.searchParams.set("lat", pos.coords.latitude.toFixed(5));
        url.searchParams.set("lng", pos.coords.longitude.toFixed(5));
        window.location.href = url.toString();
      },
      () => setBusy(false),
      { enableHighAccuracy: true, timeout: 10000 },
    );
  }

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={busy}
      className="inline-flex shrink-0 items-center gap-1.5 rounded-xl border border-[#2563a8] bg-white px-4 py-2.5 text-sm font-semibold text-[#2563a8] transition hover:bg-[#eef3fa] active:scale-[0.99] disabled:opacity-60"
    >
      📍 {busy ? locating : label}
    </button>
  );
}
