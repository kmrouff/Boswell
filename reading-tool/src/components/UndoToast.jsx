import { useEffect, useRef } from 'react';

const AUTO_DISMISS_MS = 4000;

function Toast({ toast, onDismiss }) {
  const onDismissRef = useRef(onDismiss);
  onDismissRef.current = onDismiss;

  useEffect(() => {
    const timer = setTimeout(() => onDismissRef.current(toast.id), AUTO_DISMISS_MS);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [toast.id]);

  return (
    <div className="flex items-center justify-between gap-4 rounded-lg bg-ink border border-parchment/20 px-4 py-3 text-sm text-parchment shadow-lg">
      <span>{toast.message}</span>
      {toast.onUndo && (
        <button
          type="button"
          className="shrink-0 underline text-parchment/80 hover:text-parchment"
          onClick={() => {
            toast.onUndo();
            onDismiss(toast.id);
          }}
        >
          Undo
        </button>
      )}
    </div>
  );
}

export default function UndoToast({ toasts, onDismiss }) {
  if (toasts.length === 0) return null;

  return (
    <div className="absolute inset-x-0 bottom-4 z-20 flex flex-col gap-2 px-4">
      {toasts.map((toast) => (
        <Toast key={toast.id} toast={toast} onDismiss={onDismiss} />
      ))}
    </div>
  );
}
