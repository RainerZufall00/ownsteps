export default function Logo({ className = "h-8 w-8" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 32 32"
      fill="none"
      className={className}
      aria-hidden="true"
    >
      {/* Gestrichelte Route, wie sie auch auf der Karte gezeichnet wird. */}
      <path
        d="M7 25c4.5 0 3-8 8-8s3.5-8 9-8"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeDasharray="0.5 5"
        opacity="0.55"
      />
      <circle cx="7" cy="25" r="3" fill="currentColor" opacity="0.55" />
      <path
        d="M24 3c3.3 0 6 2.7 6 6 0 4.4-6 11-6 11s-6-6.6-6-11c0-3.3 2.7-6 6-6Z"
        fill="currentColor"
      />
      <circle cx="24" cy="9" r="2.2" className="fill-paper" />
    </svg>
  );
}
