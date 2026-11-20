import { useLayoutEffect, useRef, type InputHTMLAttributes } from 'react';
import { Input } from './Input';

type Props = Omit<
  InputHTMLAttributes<HTMLInputElement>,
  'value' | 'onChange'
> & {
  value: string;
  onChange: (value: string) => void;
  format: (value: string) => string;
  separator: string;
};

export function FormattedInput({
  value,
  onChange,
  format,
  separator,
  ...props
}: Props) {
  const ref = useRef<HTMLInputElement>(null);
  const caret = useRef<number | null>(null);
  const display = format(value);

  useLayoutEffect(() => {
    if (caret.current !== null) {
      ref.current?.setSelectionRange(caret.current, caret.current);
      caret.current = null;
    }
  }, [display]);

  function update(raw: string, position: number) {
    const next = format(raw);
    const digitsBefore = (raw.slice(0, position).match(/\d/g) ?? []).length;
    let seen = 0;
    let target = 0;
    if (digitsBefore === 0 && raw.startsWith('+') && position > 0) target = 1;
    else if (digitsBefore > 0) {
      for (let i = 0; i < next.length; i++) {
        if (/\d/.test(next[i])) seen++;
        if (seen === digitsBefore) {
          target = i + 1;
          break;
        }
      }
      if (seen < digitsBefore) target = next.length;
    }
    caret.current = target;
    onChange(next);
  }

  return (
    <Input
      {...props}
      ref={ref}
      value={display}
      onChange={(event) =>
        update(
          event.target.value,
          event.target.selectionStart ?? event.target.value.length,
        )
      }
      onKeyDown={(event) => {
        const start = event.currentTarget.selectionStart;
        const end = event.currentTarget.selectionEnd;
        if (start === null || start !== end) return;
        if (event.key === 'Backspace' && display[start - 1] === separator) {
          event.preventDefault();
          update(display.slice(0, start - 2) + display.slice(start), start - 2);
        } else if (event.key === 'Delete' && display[start] === separator) {
          event.preventDefault();
          update(display.slice(0, start) + display.slice(start + 2), start);
        }
      }}
    />
  );
}
