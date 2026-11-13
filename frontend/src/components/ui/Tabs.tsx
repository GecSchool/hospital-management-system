import { useId, useRef, type KeyboardEvent, type ReactNode } from 'react';

export interface TabItem {
  id: string;
  label: string;
  content: ReactNode;
}
export interface TabsProps {
  label: string;
  items: TabItem[];
  value: string;
  onChange: (id: string) => void;
}

export function Tabs({ label, items, value, onChange }: TabsProps) {
  const baseId = useId();
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const selected = items.findIndex((item) => item.id === value);
  const active = selected < 0 ? 0 : selected;
  function move(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    const next =
      event.key === 'ArrowRight'
        ? (index + 1) % items.length
        : event.key === 'ArrowLeft'
          ? (index - 1 + items.length) % items.length
          : event.key === 'Home'
            ? 0
            : event.key === 'End'
              ? items.length - 1
              : -1;
    if (next < 0) return;
    event.preventDefault();
    onChange(items[next].id);
    refs.current[next]?.focus();
  }
  return (
    <div className="ui-tabs">
      <div role="tablist" aria-label={label} className="ui-tab-list">
        {items.map((item, index) => (
          <button
            key={item.id}
            ref={(node) => {
              refs.current[index] = node;
            }}
            id={`${baseId}-tab-${index}`}
            type="button"
            role="tab"
            aria-selected={index === active}
            aria-controls={`${baseId}-panel-${index}`}
            tabIndex={index === active ? 0 : -1}
            className="ui-tab"
            onClick={() => onChange(item.id)}
            onKeyDown={(event) => move(event, index)}
          >
            {item.label}
          </button>
        ))}
      </div>
      {items.map((item, index) => (
        <div
          key={item.id}
          id={`${baseId}-panel-${index}`}
          role="tabpanel"
          aria-labelledby={`${baseId}-tab-${index}`}
          hidden={index !== active}
          tabIndex={0}
          className="ui-tab-panel"
        >
          {item.content}
        </div>
      ))}
    </div>
  );
}
