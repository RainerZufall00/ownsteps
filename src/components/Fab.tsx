import Link from "next/link";
import { PlusIcon } from "./icons";

const BUTTON =
  "grid h-14 w-14 place-items-center rounded-full bg-accent text-accent-ink shadow-float transition active:scale-95";
const POSITION = "fixed bottom-6 right-5 z-40 sm:hidden";
const SAFE_AREA = { marginBottom: "env(safe-area-inset-bottom)" };

/**
 * The round "+" in thumb's reach on phones (larger screens have a regular
 * button). Either a link, or a form that submits `action` with `fields`.
 */
export default function Fab(
  props: { label: string } & (
    | { href: string }
    | { action: (formData: FormData) => Promise<void>; fields: Record<string, string | number> }
  ),
) {
  if ("href" in props) {
    return (
      <Link href={props.href} aria-label={props.label} className={`${POSITION} ${BUTTON}`} style={SAFE_AREA}>
        <PlusIcon />
      </Link>
    );
  }
  return (
    <form action={props.action} className={POSITION} style={SAFE_AREA}>
      {Object.entries(props.fields).map(([name, value]) => (
        <input key={name} type="hidden" name={name} value={value} />
      ))}
      <button type="submit" aria-label={props.label} className={BUTTON}>
        <PlusIcon />
      </button>
    </form>
  );
}
