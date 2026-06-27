"use client";

import { useActionState } from "react";
import { useTranslations } from "next-intl";
import { submitFoundChild, type ActionState } from "@/app/actions";
import {
  CHILD_STATUSES,
  CHILD_GENDERS,
  CHILD_INFO_SOURCES,
  LIMITS,
} from "@/lib/constants";
import { Label, TextInput, TextArea, Select, FieldError, Honeypot } from "@/components/Field";
import LocationPicker from "@/components/LocationPicker";
import PhotoInput from "@/components/PhotoInput";
import SubmitButton from "@/components/SubmitButton";

const initial: ActionState = { ok: false };

// Radio list rendered from a {key: {label}} metadata object (the form options).
function RadioGroup({
  name,
  options,
}: {
  name: string;
  options: Record<string, { label: string }>;
}) {
  return (
    <div className="grid gap-2">
      {Object.entries(options).map(([key, opt]) => (
        <label
          key={key}
          className="flex cursor-pointer items-center gap-3 rounded-xl border border-slate-300 bg-white px-4 py-3 font-medium has-[:checked]:border-[#2563a8] has-[:checked]:bg-[#eef3fa]"
        >
          <input type="radio" name={name} value={key} className="h-5 w-5 accent-[#2563a8]" />
          <span className="text-slate-800">{opt.label}</span>
        </label>
      ))}
    </div>
  );
}

export default function FoundChildForm() {
  const [state, action] = useActionState(submitFoundChild, initial);
  const t = useTranslations("children.report");
  const tCommon = useTranslations("common");
  const optional = tCommon("optional");

  return (
    <form action={action} className="space-y-5">
      <Honeypot />

      <p className="rounded-xl bg-[#eef3fa] px-4 py-3 text-sm text-[#3c5573]">
        {t("privacyNote")}
      </p>

      {state.error && (
        <p className="rounded-xl bg-red-50 px-4 py-3 font-medium text-red-700" role="alert">
          {state.error}
        </p>
      )}

      {/* 1 · Quien reporta */}
      <div>
        <Label htmlFor="reporter_name" required>{t("reporterName")}</Label>
        <TextInput id="reporter_name" name="reporter_name" required maxLength={LIMITS.name} autoComplete="name" />
        <FieldError message={state.fieldErrors?.reporter_name} />
      </div>

      {/* 2 · Nombre o apodo (único campo público) */}
      <div>
        <Label htmlFor="name" required>{t("childName")}</Label>
        <TextInput id="name" name="name" required maxLength={LIMITS.name} placeholder={t("childNamePlaceholder")} />
        <FieldError message={state.fieldErrors?.name} />
      </div>

      {/* 3 · Edad — dropdown 0–18 para estandarizar el dato (valor canónico en español). */}
      <div>
        <Label htmlFor="age">{t("age")}</Label>
        <Select id="age" name="age" defaultValue="">
          <option value="">{t("ageUnknown")}</option>
          <option value="Menos de 1 año">{t("ageUnderOne")}</option>
          {Array.from({ length: 18 }, (_, i) => i + 1).map((n) => (
            <option key={n} value={`${n} ${n === 1 ? "año" : "años"}`}>
              {t("ageYears", { n })}
            </option>
          ))}
        </Select>
      </div>

      {/* 4 · Género */}
      <fieldset>
        <legend className="mb-2 block font-semibold text-slate-800">{t("gender")}</legend>
        <RadioGroup name="gender" options={CHILD_GENDERS} />
      </fieldset>

      {/* 5 · Descripción física */}
      <div>
        <Label htmlFor="description">{t("description")}</Label>
        <TextArea id="description" name="description" maxLength={LIMITS.description} placeholder={t("descriptionPlaceholder")} />
      </div>

      {/* 6 · Lugar donde fue encontrado */}
      <div>
        <Label htmlFor="found_place">{t("foundPlace")}</Label>
        <TextInput id="found_place" name="found_place" maxLength={LIMITS.found_place} />
      </div>

      {/* 6b · Fecha donde fue encontrado */}
      <div>
        <Label htmlFor="found_at">{t("foundAt")}</Label>
        <TextInput id="found_at" name="found_at" type="date" />
      </div>

      {/* 7 · Última vez visto (fecha) */}
      <div>
        <Label htmlFor="last_seen_at">{t("lastSeenAt")}</Label>
        <TextInput id="last_seen_at" name="last_seen_at" type="date" />
      </div>

      {/* 8 · Hospital */}
      <div>
        <Label htmlFor="hospital">{t("hospital")}</Label>
        <TextInput id="hospital" name="hospital" maxLength={LIMITS.hospital} />
      </div>

      {/* 9 · Último lugar donde lo vio */}
      <div>
        <Label htmlFor="last_seen_place">{t("lastSeenPlace")}</Label>
        <TextInput id="last_seen_place" name="last_seen_place" maxLength={LIMITS.last_seen_place} />
      </div>

      {/* 10 · Situación actual */}
      <fieldset>
        <legend className="mb-2 block font-semibold text-slate-800">{t("situation")}</legend>
        <RadioGroup name="status" options={CHILD_STATUSES} />
      </fieldset>

      {/* 11 · Contacto directo */}
      <fieldset>
        <legend className="mb-2 block font-semibold text-slate-800">{t("directContact")}</legend>
        <RadioGroup name="direct_contact" options={{ true: { label: t("directYes") }, false: { label: t("directNo") } }} />
      </fieldset>

      {/* 12 · Fuente de la información */}
      <fieldset>
        <legend className="mb-2 block font-semibold text-slate-800">{t("infoSource")}</legend>
        <RadioGroup name="info_source" options={CHILD_INFO_SOURCES} />
      </fieldset>

      {/* 13 · Especifica la fuente */}
      <div>
        <Label htmlFor="info_source_detail" hint={optional}>{t("infoSourceDetail")}</Label>
        <TextInput id="info_source_detail" name="info_source_detail" maxLength={LIMITS.info_source_detail} placeholder={t("infoSourceDetailHint")} />
      </div>

      {/* 14 · Notas adicionales */}
      <div>
        <Label htmlFor="notes" hint={optional}>{t("notes")}</Label>
        <TextArea id="notes" name="notes" maxLength={LIMITS.notes} placeholder={t("notesHint")} />
      </div>

      {/* 15 · Foto */}
      <div>
        <PhotoInput label={t("photo")} />
      </div>

      {/* Ubicación opcional (geolocaliza el lugar encontrado para el mapa). */}
      <div>
        <Label htmlFor="location" hint={optional}>{t("location")}</Label>
        <LocationPicker />
      </div>

      <SubmitButton tone="action" pendingLabel={t("saving")}>
        {t("submit")}
      </SubmitButton>
    </form>
  );
}
