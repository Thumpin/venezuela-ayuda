"use client";

import Link from "next/link";
import { useActionState } from "react";
import { useTranslations } from "next-intl";
import { submitCollectionCenter, type ActionState } from "@/app/actions";
import { LIMITS } from "@/lib/constants";
import { Label, TextInput, TextArea, FieldError, Honeypot } from "@/components/Field";
import LocationPicker from "@/components/LocationPicker";
import SubmitButton from "@/components/SubmitButton";

const initial: ActionState = { ok: false };

// Common countries (the field is free-text with these as suggestions; "Venezuela"
// is what routes a center onto the map).
const COUNTRIES = [
  "Venezuela", "Colombia", "Ecuador", "Perú", "Chile", "Argentina", "Brasil",
  "Panamá", "México", "Estados Unidos", "España", "República Dominicana",
  "Costa Rica", "Uruguay",
];

export default function CollectionCenterForm() {
  const [state, action] = useActionState(submitCollectionCenter, initial);
  const t = useTranslations("forms.center");
  const tCommon = useTranslations("common");

  if (state.ok) {
    return (
      <div className="rounded-2xl border border-[#cde6da] bg-[#eef9f2] p-6 text-center">
        <div aria-hidden className="text-4xl">📦</div>
        <h2 className="mt-2 text-xl font-bold text-[#14212e]">{t("successTitle")}</h2>
        <p className="mt-2 text-sm leading-relaxed text-[#33414f]">{t("successMessage")}</p>
        <Link href="/ayudar-fuera" className="mt-4 inline-block font-semibold text-[#2563a8]">
          {t("backToList")} →
        </Link>
      </div>
    );
  }

  return (
    <form action={action} className="space-y-5">
      <Honeypot />

      {state.error && (
        <p className="rounded-xl bg-red-50 px-4 py-3 font-medium text-red-700" role="alert">
          {state.error}
        </p>
      )}

      <div>
        <Label htmlFor="name">
          {t("nameLabel")} <span className="text-red-600">*</span>
        </Label>
        <TextInput id="name" name="name" maxLength={LIMITS.name} placeholder={t("namePlaceholder")} />
        <FieldError message={state.fieldErrors?.name} />
      </div>

      <div>
        <Label htmlFor="country">
          {t("countryLabel")} <span className="text-red-600">*</span>
        </Label>
        <TextInput
          id="country"
          name="country"
          list="countries"
          maxLength={LIMITS.city}
          placeholder={t("countryPlaceholder")}
        />
        <datalist id="countries">
          {COUNTRIES.map((c) => (
            <option key={c} value={c} />
          ))}
        </datalist>
        <FieldError message={state.fieldErrors?.country} />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <Label htmlFor="state" hint={t("stateHint")}>
            {t("stateLabel")}
          </Label>
          <TextInput id="state" name="state" maxLength={LIMITS.city} />
        </div>
        <div>
          <Label htmlFor="city">{tCommon("city")}</Label>
          <TextInput id="city" name="city" maxLength={LIMITS.city} />
        </div>
      </div>

      <div>
        <Label htmlFor="address">{t("addressLabel")}</Label>
        <TextInput id="address" name="address" maxLength={200} placeholder={t("addressPlaceholder")} />
      </div>

      <div>
        <Label htmlFor="resources">{t("resourcesLabel")}</Label>
        <TextArea
          id="resources"
          name="resources"
          maxLength={LIMITS.description}
          placeholder={t("resourcesPlaceholder")}
        />
      </div>

      <div>
        <Label htmlFor="organizers">{t("organizersLabel")}</Label>
        <TextInput
          id="organizers"
          name="organizers"
          maxLength={LIMITS.name}
          placeholder={t("organizersPlaceholder")}
        />
      </div>

      <div>
        <Label htmlFor="contact" hint={t("contactHint")}>
          {t("contactLabel")}
        </Label>
        <TextInput id="contact" name="contact" maxLength={120} placeholder={t("contactPlaceholder")} />
      </div>

      <div>
        <Label htmlFor="website" hint={tCommon("optional")}>
          {t("websiteLabel")}
        </Label>
        <TextInput id="website" name="website" type="url" maxLength={500} placeholder="https://…" />
      </div>

      <fieldset>
        <legend className="mb-2 block font-semibold text-slate-800">{t("shipLegend")}</legend>
        <div className="flex flex-wrap gap-2">
          {(["si", "no", "nose"] as const).map((v) => (
            <label
              key={v}
              className="flex cursor-pointer items-center gap-2 rounded-xl border border-[#e6ecf2] bg-white px-4 py-2.5 font-medium has-[:checked]:border-[#2563a8] has-[:checked]:bg-[#eef3fa] has-[:checked]:text-[#2563a8]"
            >
              <input type="radio" name="can_ship_to_venezuela" value={v} className="sr-only" />
              {t("ship_" + v)}
            </label>
          ))}
        </div>
      </fieldset>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <Label htmlFor="volunteers_count" hint={tCommon("optional")}>
            {t("volunteersCountLabel")}
          </Label>
          <TextInput
            id="volunteers_count"
            name="volunteers_count"
            type="number"
            inputMode="numeric"
            min={0}
            placeholder="0"
          />
        </div>
        <fieldset>
          <legend className="mb-2 block font-semibold text-slate-800">
            {t("needsVolunteersLegend")}
          </legend>
          <div className="flex gap-2">
            {(["si", "no"] as const).map((v) => (
              <label
                key={v}
                className="flex cursor-pointer items-center gap-2 rounded-xl border border-[#e6ecf2] bg-white px-4 py-2.5 font-medium has-[:checked]:border-[#2f9e6e] has-[:checked]:bg-[#e9f6ef] has-[:checked]:text-[#1f7a52]"
              >
                <input type="radio" name="needs_volunteers" value={v} className="sr-only" />
                {t("yesno_" + v)}
              </label>
            ))}
          </div>
        </fieldset>
      </div>

      <div>
        <Label htmlFor="location" hint={t("locationHint")}>
          {t("locationLabel")}
        </Label>
        <LocationPicker />
      </div>

      <SubmitButton pendingLabel={t("sending")}>{t("submit")}</SubmitButton>
    </form>
  );
}
