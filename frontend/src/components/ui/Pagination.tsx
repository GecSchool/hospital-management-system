export interface PaginationProps {
  page: number;
  totalPages: number;
  onPageChange: (page: number) => void;
}

export function Pagination({
  page,
  totalPages,
  onPageChange,
}: PaginationProps) {
  const count = Math.max(0, Math.floor(totalPages));
  if (count === 0) return null;
  const current = Math.min(count, Math.max(1, Math.floor(page)));
  const start = Math.max(1, Math.min(current - 2, count - 4));
  const pages = Array.from(
    { length: Math.min(5, count) },
    (_, index) => start + index,
  );
  return (
    <nav className="ui-pagination" aria-label="페이지 탐색">
      <button
        type="button"
        aria-label="이전 페이지"
        disabled={current === 1}
        onClick={() => onPageChange(current - 1)}
      >
        ‹
      </button>
      {pages.map((number) => (
        <button
          key={number}
          type="button"
          aria-label={`${number}페이지`}
          aria-current={number === current ? 'page' : undefined}
          onClick={() => onPageChange(number)}
        >
          {number}
        </button>
      ))}
      <button
        type="button"
        aria-label="다음 페이지"
        disabled={current === count}
        onClick={() => onPageChange(current + 1)}
      >
        ›
      </button>
    </nav>
  );
}
