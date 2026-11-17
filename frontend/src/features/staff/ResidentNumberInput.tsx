import { useRef, type AriaAttributes, type ClipboardEvent } from 'react';
import { Input } from '../../components/ui';

interface ResidentNumberInputProps extends AriaAttributes {
  id?: string;
  front: string;
  back: string;
  disabled?: boolean;
  onChange(front: string, back: string): void;
}

/** Two visible fields represent one transient resident number for registration. */
export function ResidentNumberInput({
  id,
  front,
  back,
  disabled,
  onChange,
  ...aria
}: ResidentNumberInputProps) {
  const backRef = useRef<HTMLInputElement>(null);
  function pasteComplete(event: ClipboardEvent<HTMLInputElement>) {
    const value = event.clipboardData.getData('text').trim();
    if (!/^\d{6}-?\d{7}$/.test(value)) return;
    event.preventDefault();
    const digits = value.replace('-', '');
    onChange(digits.slice(0, 6), digits.slice(6));
    backRef.current?.focus();
  }
  return (
    <div className="resident-number-input">
      <Input
        {...aria}
        id={id}
        aria-label="주민등록번호 앞자리"
        type="text"
        inputMode="numeric"
        autoComplete="off"
        placeholder="앞 6자리"
        value={front}
        maxLength={6}
        required
        disabled={disabled}
        onPaste={pasteComplete}
        onChange={(event) => {
          const next = event.target.value.replace(/\D/g, '').slice(0, 6);
          onChange(next, back);
          if (
            front.length < 6 &&
            next.length === 6 &&
            event.target.selectionStart === 6
          )
            backRef.current?.focus();
        }}
      />
      <span aria-hidden="true">-</span>
      <Input
        {...aria}
        ref={backRef}
        aria-label="주민등록번호 뒷자리"
        type="text"
        inputMode="numeric"
        autoComplete="off"
        placeholder="뒤 7자리"
        value={back}
        maxLength={7}
        required
        disabled={disabled}
        onChange={(event) =>
          onChange(front, event.target.value.replace(/\D/g, '').slice(0, 7))
        }
      />
    </div>
  );
}
