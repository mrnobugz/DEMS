import { useEffect, useRef } from "react";
import { Toaster as SonnerToaster, toast } from "sonner";
import { useUiPrefs } from "@/lib/uiPrefs";

export function Toaster() {
  const dark = useUiPrefs((s) => s.dark);
  return (
    <SonnerToaster
      theme={dark ? "dark" : "light"}
      position="top-right"
      richColors
      closeButton
      toastOptions={{
        style: {
          background: "var(--bg-surface)",
          color: "var(--text-primary)",
          border: "1px solid var(--border)",
        },
      }}
    />
  );
}

function toneFor(message: string) {
  return /fail|could not|error|invalid|unable|denied/i.test(message) ? "error" : "success";
}

export function useAnnounce(message: string) {
  const last = useRef("");
  useEffect(() => {
    if (!message) {
      last.current = "";
      return;
    }
    if (message === last.current) return;
    last.current = message;
    if (toneFor(message) === "error") toast.error(message);
    else toast.success(message);
  }, [message]);
}

export { toast };
