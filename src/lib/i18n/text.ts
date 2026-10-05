import { LIMIT_PARAMS } from "../limits";

/**
 * Small helpers for dictionary strings. Placeholders are `{name}`; plurals
 * are `{ one, other }` pairs – enough for English and German, which both only
 * tell 1 apart from everything else. The limits (`LIMIT_PARAMS`) are always
 * available, so no text repeats a number from `limits.ts`.
 */

export type Plural = { one: string; other: string };

export function fill(template: string, params: Record<string, string | number> = {}) {
  const values: Record<string, string | number> = { ...LIMIT_PARAMS, ...params };
  return template.replace(/\{(\w+)\}/g, (_, key: string) =>
    key in values ? String(values[key]) : "",
  );
}

/** Picks the form for `count` and fills `{count}` plus any other params. */
export function plural(
  forms: Plural,
  count: number,
  params: Record<string, string | number> = {},
) {
  return fill(count === 1 ? forms.one : forms.other, { ...params, count });
}
