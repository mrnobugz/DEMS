import { useEffect } from "react";
import { useI18n } from "../i18n/LanguageProvider";

export function usePageTitle(title: string) {
  const { lang } = useI18n();
  useEffect(() => {
    document.documentElement.lang = lang;
    document.title = `${title} — GEGO`;
  }, [title, lang]);
}