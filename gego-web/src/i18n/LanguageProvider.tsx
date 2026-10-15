import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { messages, type Lang, type Messages } from "./messages";

const STORAGE_KEY = "gego-lang";

type LanguageValue = {
  lang: Lang;
  setLang: (lang: Lang) => void;
  m: Messages;
};

const LanguageContext = createContext<LanguageValue | null>(null);

function readLang(): Lang {
  if (typeof localStorage === "undefined") return "sw";
  return localStorage.getItem(STORAGE_KEY) === "en" ? "en" : "sw";
}

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>(readLang);

  const setLang = (next: Lang) => {
    localStorage.setItem(STORAGE_KEY, next);
    setLangState(next);
  };

  useEffect(() => {
    document.documentElement.lang = lang;
    const description = document.querySelector('meta[name="description"]');
    if (description) description.setAttribute("content", messages[lang].metaDescription);
  }, [lang]);

  const value = useMemo(() => ({ lang, setLang, m: messages[lang] }), [lang]);

  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
}

export function useI18n() {
  const value = useContext(LanguageContext);
  if (!value) throw new Error("useI18n must be used inside LanguageProvider");
  return value;
}

export function LanguageSwitch({ onDark = false }: { onDark?: boolean }) {
  const { lang, setLang, m } = useI18n();
  return (
    <div role="group" aria-label={m.languageLabel} className={`lang-switch ${onDark ? "lang-switch-dark" : ""}`}>
      <button type="button" aria-pressed={lang === "sw"} onClick={() => setLang("sw")}>
        Kiswahili
      </button>
      <button type="button" aria-pressed={lang === "en"} onClick={() => setLang("en")}>
        English
      </button>
    </div>
  );
}
