import type { ReactNode } from "react";

/** One entry of the settings lists (accounts, devices, readers): name, detail, action. */
export default function ListRow({
  title,
  detail,
  children,
}: {
  title: ReactNode;
  detail: ReactNode;
  /** On the right: a badge or a small form. */
  children?: ReactNode;
}) {
  return (
    <li className="flex items-center justify-between gap-3 rounded-2xl bg-surface-muted px-4 py-3">
      <span className="min-w-0">
        <span className="block truncate font-medium">{title}</span>
        <span className="block truncate text-[13px] text-ink-soft">{detail}</span>
      </span>
      {children}
    </li>
  );
}

/** A row's action, e.g. "Remove": a form posting one hidden field. */
export function RowAction({
  action,
  name,
  value,
  children,
}: {
  action: (formData: FormData) => Promise<void>;
  name: string;
  value: string | number;
  children: ReactNode;
}) {
  return (
    <form action={action}>
      <input type="hidden" name={name} value={value} />
      <button
        type="submit"
        className="shrink-0 text-sm font-semibold text-ink-soft transition hover:text-accent"
      >
        {children}
      </button>
    </form>
  );
}
