import { Button } from "@/components/ui/button";

export function Pagination({
  page,
  pageCount,
  onPage,
  disabled,
}: {
  page: number;
  pageCount: number;
  onPage: (page: number) => void;
  disabled?: boolean;
}) {
  return (
    <nav aria-label="Pagination" className="flex flex-wrap items-center gap-2">
      <Button variant="ghost" type="button" disabled={disabled || page <= 1} onClick={() => onPage(page - 1)}>
        Previous
      </Button>
      <span className="text-sm text-muted" aria-live="polite">
        Page {page} of {Math.max(pageCount, 1)}
      </span>
      <Button variant="ghost" type="button" disabled={disabled || page >= pageCount} onClick={() => onPage(page + 1)}>
        Next
      </Button>
    </nav>
  );
}
