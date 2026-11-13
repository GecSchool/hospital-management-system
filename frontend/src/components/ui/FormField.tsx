import {
  cloneElement,
  type AriaAttributes,
  type ReactElement,
  type ReactNode,
} from 'react';

interface ControlProps extends AriaAttributes {
  id?: string;
}

export interface FormFieldProps {
  id: string;
  label: ReactNode;
  error?: string;
  hint?: string;
  children: ReactElement<ControlProps>;
}

export function FormField({
  id,
  label,
  error,
  hint,
  children,
}: FormFieldProps) {
  const messageId = error ? `${id}-error` : hint ? `${id}-hint` : undefined;
  const describedBy =
    [children.props['aria-describedby'], messageId].filter(Boolean).join(' ') ||
    undefined;
  return (
    <div className="ui-form-field">
      <label htmlFor={id}>{label}</label>
      {cloneElement(children, {
        id,
        'aria-invalid': error ? true : children.props['aria-invalid'],
        'aria-describedby': describedBy,
      })}
      {error ? (
        <p id={messageId} className="ui-field-error" role="alert">
          {error}
        </p>
      ) : hint ? (
        <p id={messageId} className="ui-field-hint">
          {hint}
        </p>
      ) : null}
    </div>
  );
}
