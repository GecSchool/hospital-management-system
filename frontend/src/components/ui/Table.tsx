import type { Key, ReactNode } from 'react';

export interface TableColumn<T> {
  id: string;
  header: ReactNode;
  render: (row: T) => ReactNode;
}

export interface TableProps<T> {
  caption: string;
  columns: TableColumn<T>[];
  rows: T[];
  rowKey: (row: T) => Key;
  emptyMessage?: string;
}

export function Table<T>({
  caption,
  columns,
  rows,
  rowKey,
  emptyMessage = '조회된 항목이 없습니다.',
}: TableProps<T>) {
  return (
    <div
      className="ui-table-scroll"
      role="region"
      aria-label={caption}
      tabIndex={0}
    >
      <table className="ui-table">
        <caption className="sr-only">{caption}</caption>
        <thead>
          <tr>
            {columns.map((column) => (
              <th key={column.id} scope="col">
                {column.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.length ? (
            rows.map((row) => (
              <tr key={rowKey(row)}>
                {columns.map((column) => (
                  <td key={column.id}>{column.render(row)}</td>
                ))}
              </tr>
            ))
          ) : (
            <tr>
              <td colSpan={columns.length} className="ui-table-empty">
                {emptyMessage}
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
