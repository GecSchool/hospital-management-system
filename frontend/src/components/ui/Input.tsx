import type { InputHTMLAttributes, SelectHTMLAttributes } from 'react';

export function Input({
  className = '',
  ...props
}: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={`ui-input ${className}`} {...props} />;
}

export function Select({
  className = '',
  children,
  ...props
}: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select className={`ui-input ui-select ${className}`} {...props}>
      {children}
    </select>
  );
}
