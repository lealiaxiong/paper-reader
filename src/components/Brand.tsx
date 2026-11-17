type BrandButtonProps = {
  onClick: () => void;
  showWordmark?: boolean;
  className?: string;
};

/** Page-with-margin-figure mark, used in both header variants. */
export function BrandMark() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 18 18"
      fill="none"
      aria-hidden="true"
    >
      <rect
        x="2"
        y="2.5"
        width="9"
        height="13"
        rx="1.6"
        stroke="currentColor"
        strokeWidth="1.4"
      />
      <path
        d="M4.5 6h4M4.5 8.5h4M4.5 11h2.5"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinecap="round"
      />
      <rect x="13" y="5" width="3" height="4" rx="0.8" fill="currentColor" />
    </svg>
  );
}

export default function BrandButton({
  onClick,
  showWordmark = true,
  className = "",
}: BrandButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label="Paper Reader home"
      className={`flex shrink-0 items-center gap-2 rounded-lg ${className}`}
    >
      <span className="grid h-8 w-8 place-items-center rounded-lg bg-accent text-background">
        <BrandMark />
      </span>
      {showWordmark && (
        <span className="hidden font-reading text-sm font-semibold tracking-tight text-foreground sm:block">
          Paper Reader
        </span>
      )}
    </button>
  );
}
