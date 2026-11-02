/**
 * The app's inline icons, so each shape lives in one place. They inherit the
 * text color; size and spacing come from `className`.
 */

type IconProps = { className?: string };

function StrokeIcon({
  className,
  d,
  strokeWidth = 2,
}: IconProps & { d: string; strokeWidth?: number }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
      <path
        d={d}
        stroke="currentColor"
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
    </svg>
  );
}

export function ChevronLeftIcon({ className = "h-4 w-4" }: IconProps) {
  return <StrokeIcon className={className} d="m15 5-7 7 7 7" />;
}

export function ChevronRightIcon({ className = "h-4 w-4" }: IconProps) {
  return <StrokeIcon className={className} d="m9 5 7 7-7 7" />;
}

export function ChevronUpIcon({ className = "h-4 w-4" }: IconProps) {
  return <StrokeIcon className={className} d="m5 15 7-7 7 7" />;
}

export function ChevronDownIcon({ className = "h-4 w-4" }: IconProps) {
  return <StrokeIcon className={className} d="m5 9 7 7 7-7" />;
}

export function InfoIcon({ className = "h-5 w-5" }: IconProps) {
  return (
    <StrokeIcon
      className={className}
      d="M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Zm0-10v5m0-8h.01"
    />
  );
}

export function MapIcon({ className = "h-4 w-4" }: IconProps) {
  return (
    <StrokeIcon
      className={className}
      d="m9 4-6 2.5v13.5l6-2.5 6 2.5 6-2.5V4l-6 2.5L9 4Zm0 0v13.5m6-11v13.5"
      strokeWidth={1.8}
    />
  );
}

export function ExpandIcon({ className = "h-4 w-4" }: IconProps) {
  return <StrokeIcon className={className} d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7" />;
}

export function SoundOnIcon({ className = "h-5 w-5" }: IconProps) {
  return (
    <StrokeIcon
      className={className}
      d="M11 5 6 9H3v6h3l5 4V5Zm4.5 3.5a5 5 0 0 1 0 7m3-10a9 9 0 0 1 0 13"
    />
  );
}

export function SoundOffIcon({ className = "h-5 w-5" }: IconProps) {
  return <StrokeIcon className={className} d="M11 5 6 9H3v6h3l5 4V5Zm5 5 5 5m0-5-5 5" />;
}

export function PlusIcon({ className = "h-6 w-6", strokeWidth = 2.5 }: IconProps & { strokeWidth?: number }) {
  return <StrokeIcon className={className} d="M12 5v14M5 12h14" strokeWidth={strokeWidth} />;
}

export function CloseIcon({ className = "h-4 w-4" }: IconProps) {
  return <StrokeIcon className={className} d="m6 6 12 12M18 6 6 18" />;
}

export function LockIcon({ className = "h-[18px] w-[18px]" }: IconProps) {
  return (
    <StrokeIcon
      className={className}
      d="M12 15v2m-6 4h12a2 2 0 0 0 2-2v-6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2Zm10-10V7a4 4 0 0 0-8 0v4h8Z"
    />
  );
}

export function CommentIcon({ className = "h-4 w-4" }: IconProps) {
  return (
    <StrokeIcon
      className={className}
      d="M21 12a8 8 0 0 1-8 8H5l-1 2-1-4a8 8 0 0 1 8-12h2a8 8 0 0 1 8 6Z"
      strokeWidth={1.8}
    />
  );
}

export function EyeIcon({ className = "h-4 w-4" }: IconProps) {
  return (
    <StrokeIcon
      className={className}
      d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12Zm10 3a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z"
    />
  );
}

export function PinIcon({ className = "h-4 w-4 text-accent" }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
      <path
        d="M12 21s7-6.3 7-11a7 7 0 1 0-14 0c0 4.7 7 11 7 11Z"
        fill="currentColor"
        opacity="0.25"
      />
      <circle cx="12" cy="10" r="2.6" fill="currentColor" />
    </svg>
  );
}

export function PlayIcon({ className = "h-5 w-5 fill-white" }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
      <path d="M8 5.5v13l11-6.5z" />
    </svg>
  );
}

export function LocateIcon({ className = "h-4 w-4" }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
      <circle cx="12" cy="12" r="7" stroke="currentColor" strokeWidth="2" fill="none" />
      <circle cx="12" cy="12" r="2.5" fill="currentColor" />
      <path
        d="M12 2v2m0 16v2M2 12h2m16 0h2"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  );
}

/** A walker on a disc, marking comments written by the people on the trip. */
export function TeamIcon({ className = "h-4 w-4 text-team" }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
      <circle cx="12" cy="12" r="12" fill="currentColor" />
      <path
        transform="translate(4.2 4) scale(0.66)"
        fill="white"
        d="M13.5 5.5c1.1 0 2-.9 2-2s-.9-2-2-2-2 .9-2 2 .9 2 2 2zM9.8 8.9 7 23h2.1l1.8-8 2.1 2v6h2v-7.5l-2.1-2 .6-3C14.8 12 16.8 13 19 13v-2c-1.9 0-3.5-1-4.3-2.4l-1-1.6c-.4-.6-1-1-1.7-1-.3 0-.5.1-.8.1L6 8.3V13h2V9.6l1.8-.7"
      />
    </svg>
  );
}
