import type { AriaAttributes } from 'react';
import { FormattedInput } from '../../components/ui/FormattedInput';

export function formatPhoneInput(value: string) {
  const digits = value.replace(/\D/g, '');
  if (value.trim().startsWith('+')) return `+${digits}`;
  const prefixLength = digits.startsWith('02') ? 2 : 3;
  if (digits.length <= prefixLength) return digits;
  const remaining = digits.slice(prefixLength);
  const middleLength = digits.length > prefixLength + 7 ? 4 : 3;
  if (remaining.length <= middleLength)
    return `${digits.slice(0, prefixLength)}-${remaining}`;
  return `${digits.slice(0, prefixLength)}-${remaining.slice(0, middleLength)}-${remaining.slice(middleLength)}`;
}

export function PhoneInput({
  id,
  value,
  onChange,
  ...props
}: AriaAttributes & {
  id?: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  required?: boolean;
  disabled?: boolean;
}) {
  return (
    <FormattedInput
      {...props}
      id={id}
      type="tel"
      inputMode="tel"
      autoComplete="off"
      value={value}
      onChange={onChange}
      format={formatPhoneInput}
      separator="-"
    />
  );
}
