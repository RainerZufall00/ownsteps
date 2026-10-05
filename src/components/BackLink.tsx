import Link from "next/link";
import type { ReactNode } from "react";
import { ChevronLeftIcon } from "./icons";

/** "‹ All trips" and friends above a page's heading. */
export default function BackLink({
  href,
  children,
  className = "",
}: {
  href: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <Link
      href={href}
      className={`inline-flex items-center gap-1.5 text-sm font-medium text-ink-soft transition hover:text-ink ${className}`}
    >
      <ChevronLeftIcon />
      {children}
    </Link>
  );
}
