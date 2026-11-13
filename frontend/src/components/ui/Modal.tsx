import { useEffect, useId, useRef, type ReactNode } from 'react';

export interface ModalProps {
  open: boolean;
  className?: string;
  title: string;
  description?: string;
  children: ReactNode;
  footer?: ReactNode;
  onClose: () => void;
}

/** Native dialog supplies focus containment, inert background, and focus restoration. */
export function Modal({
  open,
  className = '',
  title,
  description,
  children,
  footer,
  onClose,
}: ModalProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const descriptionId = useId();
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      if (typeof dialog.showModal === 'function') dialog.showModal();
      else dialog.setAttribute('open', ''); // DOM test environments without dialog support.
    } else if (!open && dialog.open) {
      if (typeof dialog.close === 'function') dialog.close();
      else dialog.removeAttribute('open');
    }
  }, [open]);

  return (
    <dialog
      ref={dialogRef}
      className={`ui-modal ${className}`}
      aria-labelledby={titleId}
      aria-describedby={description ? descriptionId : undefined}
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      onClose={() => {
        if (open) onClose();
      }}
    >
      <header className="ui-modal-header">
        <h2 id={titleId}>{title}</h2>
      </header>
      {description ? (
        <p id={descriptionId} className="ui-modal-description">
          {description}
        </p>
      ) : null}
      <div className="ui-modal-body">{children}</div>
      {footer ? <footer className="ui-modal-footer">{footer}</footer> : null}
    </dialog>
  );
}
