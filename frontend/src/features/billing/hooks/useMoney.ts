import { useEffect, useState } from "react";
import { formatMoney } from "@/lib/i18n";
import { useUiPrefs } from "@/lib/uiPrefs";

export function useMoney() {
  const currency = useUiPrefs((state) => state.currency);
  const locale = useUiPrefs((state) => state.locale);
  const code = currency || "TZS";
  const loc = locale || "en-TZ";
  return {
    currency: code,
    locale: loc,
    money: (amount: number) => formatMoney(amount, code, loc),
  };
}

export function useDebounced(value: string, delay = 300) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(value), delay);
    return () => window.clearTimeout(timer);
  }, [value, delay]);
  return debounced;
}
