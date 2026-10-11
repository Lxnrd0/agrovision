"use client";

import { useEffect, useRef } from "react";
import { X, Check, AlertCircle, Loader2 } from "lucide-react";

export function Modal({
  title,
  children,
  onClose,
  wide = false,
}: {
  title: string;
  children: React.ReactNode;
  onClose: () => void;
  wide?: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const element = ref.current;

    element?.showModal();

    return () => element?.close();
  }, []);

  return (
    <dialog
      ref={ref}
      className={`modal ${wide ? "wide" : ""}`}
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      onClick={(event) => {
        if (event.target === ref.current) {
          onClose();
        }
      }}
    >
      <div className="modal-heading">
        <h2>{title}</h2>

        <button
          type="button"
          className="icon-button"
          onClick={onClose}
          aria-label="Cerrar ventana"
        >
          <X size={20} />
        </button>
      </div>

      {children}
    </dialog>
  );
}

export function Badge({
  children,
  tone = "green",
}: {
  children: React.ReactNode;
  tone?: "green" | "orange" | "gray";
}) {
  return <span className={`badge ${tone}`}>{children}</span>;
}

export function Toast({
  message,
  error,
  onClose,
}: {
  message: string;
  error?: boolean;
  onClose: () => void;
}) {
  useEffect(() => {
    const timer = setTimeout(onClose, 5000);

    return () => clearTimeout(timer);
  }, [message, onClose]);

  return (
    <div
      className={`toast ${error ? "error" : ""}`}
      role={error ? "alert" : "status"}
    >
      {error ? <AlertCircle size={19} /> : <Check size={19} />}

      <span>{message}</span>

      <button
        type="button"
        aria-label="Cerrar notificación"
        onClick={onClose}
      >
        <X size={16} />
      </button>
    </div>
  );
}

export function Loading() {
  return <Loader2 className="spin" size={18} />;
}
