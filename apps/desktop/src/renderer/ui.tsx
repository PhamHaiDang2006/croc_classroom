import { useEffect, useRef } from "react";
import type { ReactNode } from "react";

export function Mark() {
  return (
    <svg
      width="32"
      height="32"
      viewBox="0 0 32 32"
      fill="none"
      aria-hidden="true"
    >
      <path
        d="M6 10h15l5 5-5 5H9l-3 4V10Z"
        stroke="currentColor"
        strokeWidth="2"
      />
      <path d="M10 14h9m-9 4h5" stroke="currentColor" strokeWidth="2" />
      <circle cx="22" cy="11" r="2" fill="currentColor" />
    </svg>
  );
}
export function Modal({
  title,
  close,
  children,
}: {
  title: string;
  close: () => void;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current!;
    dialog.showModal();
    return () => dialog.close();
  }, []);
  return (
    <dialog ref={ref} onCancel={(event) => { event.preventDefault(); close(); }} aria-label={title}>
      <div className="dialog-heading">
        <h2>{title}</h2>
        <button onClick={close} aria-label="Đóng hộp thoại">
          Đóng
        </button>
      </div>
      {children}
    </dialog>
  );
}
