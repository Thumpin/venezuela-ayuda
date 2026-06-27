// A single person-record row built from shadcn/ui primitives. The photo is a
// large, readable thumbnail; clicking it opens a full-size lightbox so the
// reviewer can study the face. Kept by default; toggled to "remove" when it
// doesn't belong. The number badge is the keyboard hotkey.
"use client";

import { useState } from "react";
import { ZoomIn } from "lucide-react";
import { cn } from "@/lib/utils";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Kbd } from "@/components/ui/kbd";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { formatPhone, type RecordSummary } from "@/lib/dedupeApi";

function initials(name: string | null) {
  if (!name) return "?";
  return name
    .replace(/\(.*?\)/g, "")
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("");
}

export default function RecordCard({
  record,
  index,
  removed,
  onToggle,
}: {
  record: RecordSummary;
  index: number; // 1-based; shown as the keyboard hotkey
  removed: boolean;
  onToggle: () => void;
}) {
  const [imgOk, setImgOk] = useState(true);
  const phone = formatPhone(record.contact_phone_e164);
  const name = record.person_name_raw || "Sin nombre";
  const src = record.image_public_path;
  const hasImage = Boolean(src) && imgOk;

  const photo = (
    <Avatar className="size-16 rounded-xl ring-1 ring-border sm:size-20">
      {src && (
        <AvatarImage
          src={src}
          alt={name}
          onError={() => setImgOk(false)}
          className={cn(removed && "grayscale")}
        />
      )}
      <AvatarFallback className="text-xl">{initials(record.person_name_raw)}</AvatarFallback>
    </Avatar>
  );

  return (
    <div
      className={cn(
        "flex items-center gap-2.5 rounded-xl border p-2.5 transition sm:gap-3 sm:p-3",
        removed
          ? "border-destructive/30 bg-destructive/5"
          : "border-border bg-white hover:border-primary/40",
      )}
    >
      {/* Hotkey badge — hidden on small screens (no physical keyboard there) */}
      <Kbd
        className={cn(
          "hidden size-6 shrink-0 justify-center text-xs font-bold sm:flex",
          removed && "bg-destructive/15 text-destructive",
        )}
        aria-hidden
      >
        {index}
      </Kbd>

      {/* Photo — click to zoom (only when there's a real image) */}
      {hasImage ? (
        <Dialog>
          <DialogTrigger asChild>
            <button
              type="button"
              className="group relative shrink-0 rounded-xl outline-none focus-visible:ring-[3px] focus-visible:ring-ring/40"
              aria-label={`Ampliar foto de ${name}`}
            >
              {photo}
              <span className="absolute inset-0 flex items-center justify-center rounded-xl bg-black/0 opacity-0 transition group-hover:bg-black/30 group-hover:opacity-100">
                <ZoomIn className="size-6 text-white" />
              </span>
            </button>
          </DialogTrigger>
          <DialogContent className="max-w-md">
            <DialogTitle className="pr-8">{name}</DialogTitle>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={src as string}
              alt={name}
              className="max-h-[70vh] w-full rounded-xl object-contain"
            />
            <p className="text-sm text-muted-foreground">
              {[record.last_seen_location_raw, phone, record.folio]
                .filter(Boolean)
                .join(" · ")}
            </p>
          </DialogContent>
        </Dialog>
      ) : (
        <div className="shrink-0">{photo}</div>
      )}

      {/* Facts */}
      <div className="min-w-0 flex-1">
        <p
          className={cn(
            "truncate text-base font-semibold leading-tight",
            removed ? "text-muted-foreground line-through" : "text-foreground",
          )}
        >
          {name}
        </p>
        <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-sm text-muted-foreground">
          {record.last_seen_location_raw && (
            <span className="truncate">📍 {record.last_seen_location_raw}</span>
          )}
          {phone && <span className="tabular-nums">📞 {phone}</span>}
          {record.age != null && record.age !== "" && <span>🎂 {record.age}</span>}
        </div>
        {record.folio && (
          <Badge variant="secondary" className="mt-1.5 font-mono text-[10px]">
            {record.folio}
          </Badge>
        )}
      </div>

      {/* Keep / remove toggle */}
      <Button
        type="button"
        variant={removed ? "destructive-solid" : "outline"}
        onClick={onToggle}
        aria-pressed={removed}
        className="shrink-0"
      >
        {removed ? "Quitado ✕" : "Quitar"}
      </Button>
    </div>
  );
}
