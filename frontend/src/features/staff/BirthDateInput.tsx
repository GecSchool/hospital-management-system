import type { AriaAttributes } from 'react';
import { FormattedInput } from '../../components/ui/FormattedInput';

function formatBirthDate(value: string) {
  const digits = value.replace(/\D/g, '').slice(0, 8);
  return [digits.slice(0, 4), digits.slice(4, 6), digits.slice(6, 8)]
    .filter(Boolean)
    .join('.');
}

export function BirthDateInput({
  id,
  value,
  onChange,
  ...aria
}: AriaAttributes & {
  id?: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <FormattedInput
      {...aria}
      id={id}
      type="text"
      inputMode="numeric"
      autoComplete="off"
      placeholder="YYYY.MM.DD"
      value={value}
      onChange={onChange}
      format={formatBirthDate}
      separator="."
    />
  );
}
