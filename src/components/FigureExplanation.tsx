type Props = {
  explanation: string;
  className?: string;
  size?: "card" | "lightbox";
};

export const MUSE_EMBER_NOTE = "“In short” notes provided by Muse Ember";

/**
 * Collapsed-by-default AI gloss. Attribution is shown once per figure
 * collection so it doesn't repeat on every card.
 */
export default function FigureExplanation({
  explanation,
  className = "",
  size = "card",
}: Props) {
  const lightbox = size === "lightbox";

  return (
    <details
      className={`group rounded-lg border border-border bg-surface ${className}`}
    >
      <summary
        className={`flex cursor-pointer list-none items-center justify-between gap-3 [&::-webkit-details-marker]:hidden ${
          lightbox ? "p-4" : "px-3 py-2"
        }`}
      >
        <span className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
          <svg
            width="12"
            height="12"
            viewBox="0 0 24 24"
            fill="currentColor"
            className="shrink-0 text-accent"
            aria-hidden="true"
          >
            <path d="M12 4l1.5 5 5 1.5-5 1.5-1.5 5-1.5-5-5-1.5 5-1.5L12 4Z" />
          </svg>
          In short
        </span>
        <svg
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="shrink-0 text-subtle transition-transform group-open:rotate-180"
          aria-hidden="true"
        >
          <path d="m6 9 6 6 6-6" />
        </svg>
      </summary>
      <div
        className={`border-t border-border/70 font-reading text-muted ${
          lightbox
            ? "px-4 py-3 text-sm leading-6"
            : "px-3 py-2.5 text-[13px] leading-[1.55]"
        }`}
      >
        {explanation}
      </div>
    </details>
  );
}
