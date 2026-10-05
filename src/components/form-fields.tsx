"use client";

import type { ReactNode } from "react";
import { useI18n } from "@/lib/i18n/client";
import { fill } from "@/lib/i18n/text";
import {
  PASSWORD_MIN_LENGTH,
  TRIP_SUMMARY_MAX_LENGTH,
  TRIP_TITLE_MAX_LENGTH,
} from "@/lib/limits";

/** Field groups more than one form needs – so labels, limits and hints stay alike. */

export function NewPasswordInput({ id, name }: { id: string; name: string }) {
  const { t } = useI18n();
  return (
    <input
      id={id}
      name={name}
      type="password"
      autoComplete="new-password"
      required
      minLength={PASSWORD_MIN_LENGTH}
      className="field"
      placeholder={fill(t.common.passwordMinLength)}
    />
  );
}

/**
 * Name, email and password of an account. `own` is for the person's own
 * account (initial setup): only then may the browser offer to autofill.
 */
export function AccountFields({
  idPrefix,
  nameLabel,
  namePlaceholder,
  own = false,
}: {
  idPrefix: string;
  nameLabel: string;
  namePlaceholder?: string;
  own?: boolean;
}) {
  const { t } = useI18n();
  return (
    <>
      <div>
        <label className="label" htmlFor={`${idPrefix}name`}>
          {nameLabel}
        </label>
        <input
          id={`${idPrefix}name`}
          name="name"
          type="text"
          autoComplete={own ? "name" : "off"}
          required
          className="field"
          placeholder={namePlaceholder}
        />
      </div>

      <div>
        <label className="label" htmlFor={`${idPrefix}email`}>
          {t.common.email}
        </label>
        <input
          id={`${idPrefix}email`}
          name="email"
          type="email"
          autoComplete={own ? "username" : "off"}
          inputMode="email"
          required
          className="field"
          placeholder={t.common.emailPlaceholder}
        />
      </div>

      <div>
        <label className="label" htmlFor={`${idPrefix}password`}>
          {t.common.password}
        </label>
        <NewPasswordInput id={`${idPrefix}password`} name="password" />
      </div>
    </>
  );
}

export type TripFieldValues = {
  title: string;
  startDate: string;
  endDate: string;
  summary: string;
};

/**
 * A trip's name, date range and description. Controlled: React 19 resets a
 * form after every action, and rejected input should stay put.
 */
export function TripFields({
  idPrefix,
  values,
  onChange,
  titleLabel,
  summaryLabel,
  placeholders = {},
  markOptional = false,
  rangeHint,
  autoFocus = false,
}: {
  idPrefix: string;
  values: TripFieldValues;
  onChange: (values: TripFieldValues) => void;
  titleLabel: string;
  summaryLabel: string;
  placeholders?: { title?: string; summary?: string };
  /** Marks everything but the name as optional – for a new trip. */
  markOptional?: boolean;
  /** Shown under the date range. */
  rangeHint?: ReactNode;
  autoFocus?: boolean;
}) {
  const { t } = useI18n();
  const optional = markOptional ? (
    <>
      {" "}
      <span className="text-ink-faint">{t.common.optional}</span>
    </>
  ) : null;
  const set = (key: keyof TripFieldValues) => (value: string) =>
    onChange({ ...values, [key]: value });

  return (
    <>
      <div>
        <label className="label" htmlFor={`${idPrefix}title`}>
          {titleLabel}
        </label>
        <input
          id={`${idPrefix}title`}
          name="title"
          required
          maxLength={TRIP_TITLE_MAX_LENGTH}
          className="field"
          placeholder={placeholders.title}
          autoFocus={autoFocus}
          value={values.title}
          onChange={(event) => set("title")(event.target.value)}
        />
      </div>

      {/* The date range may stay open – often the end isn't fixed yet. */}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="label" htmlFor={`${idPrefix}start`}>
            {t.common.from}
            {optional}
          </label>
          <input
            id={`${idPrefix}start`}
            name="startDate"
            type="date"
            className="field"
            value={values.startDate}
            onChange={(event) => set("startDate")(event.target.value)}
          />
        </div>
        <div>
          <label className="label" htmlFor={`${idPrefix}end`}>
            {t.common.to}
            {optional}
          </label>
          <input
            id={`${idPrefix}end`}
            name="endDate"
            type="date"
            className="field"
            value={values.endDate}
            onChange={(event) => set("endDate")(event.target.value)}
          />
        </div>
      </div>
      {rangeHint && <p className="-mt-2 text-[13px] text-ink-faint">{rangeHint}</p>}

      <div>
        <label className="label" htmlFor={`${idPrefix}summary`}>
          {summaryLabel}
          {optional}
        </label>
        <textarea
          id={`${idPrefix}summary`}
          name="summary"
          rows={3}
          maxLength={TRIP_SUMMARY_MAX_LENGTH}
          className="field resize-none"
          placeholder={placeholders.summary}
          value={values.summary}
          onChange={(event) => set("summary")(event.target.value)}
        />
      </div>
    </>
  );
}
