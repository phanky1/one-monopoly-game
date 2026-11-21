import React, { useLayoutEffect, useRef } from 'react';
import { createPortal } from 'react-dom';

interface Props {
  labelledBy: string;
  onClose?: () => void;
  children: React.ReactNode;
}

export const BoardDialog: React.FC<Props> = ({ labelledBy, onClose, children }) => {
  const dialogRef = useRef<HTMLDialogElement>(null);

  useLayoutEffect(() => {
    const dialog = dialogRef.current!;
    dialog.showModal();
    return () => dialog.close();
  }, []);

  return createPortal(
    <dialog
      ref={dialogRef}
      aria-labelledby={labelledBy}
      onCancel={(event) => {
        event.preventDefault();
        onClose?.();
      }}
      className="chart-dialog"
    >
      {children}
    </dialog>,
    document.body
  );
};
