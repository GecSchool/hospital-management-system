import type { ButtonHTMLAttributes } from 'react';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary';
  size?: 'default' | 'compact';
}

export function Button({
  variant = 'primary',
  size = 'default',
  type = 'button',
  className = '',
  ...props
}: ButtonProps) {
  return (
    <button
      type={type}
      className={`ui-button ui-button--${variant} ui-button--${size} ${className}`}
      {...props}
    />
  );
}
