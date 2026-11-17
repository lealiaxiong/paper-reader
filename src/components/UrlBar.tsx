type Props = {
  url: string;
  onUrlChange: (v: string) => void;
  onSubmit: () => void;
  loading: boolean;
  error: string | null;
  autoFocus?: boolean;
};

/** arXiv URL form, used on the landing header and in the reading toolbar. */
export default function UrlBar({
  url,
  onUrlChange,
  onSubmit,
  loading,
  error,
  autoFocus = false,
}: Props) {
  return (
    <div className="w-full">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          onSubmit();
        }}
        className="flex gap-2"
      >
        <input
          value={url}
          onChange={(e) => onUrlChange(e.target.value)}
          placeholder="https://arxiv.org/abs/2401.12345"
          autoFocus={autoFocus}
          className="h-10 min-w-0 flex-1 rounded-lg border border-border bg-surface-raised px-3 text-sm text-foreground shadow-sm transition-colors placeholder:text-subtle hover:border-border-strong focus:border-accent"
          aria-label="arXiv URL"
        />
        <button
          type="submit"
          disabled={loading || !url.trim()}
          className="h-10 rounded-lg border border-transparent bg-button px-4 text-sm font-medium text-button-foreground transition-colors hover:bg-button-hover disabled:cursor-not-allowed disabled:border-border disabled:bg-surface disabled:text-subtle disabled:hover:bg-surface"
        >
          {loading ? "Loading…" : "Open"}
        </button>
      </form>
      {error && (
        <p role="alert" className="mt-2 text-sm text-danger">
          {error}
        </p>
      )}
    </div>
  );
}
