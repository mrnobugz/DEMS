import type { ReactNode } from "react";
import { Outlet } from "react-router-dom";
import { useI18n } from "../i18n/LanguageProvider";
import { SiteFooter } from "./SiteFooter";
import { SiteHeader } from "./SiteHeader";

export function MarketingLayout({ children }: { children?: ReactNode }) {
  const { m } = useI18n();
  return (
    <div className="flex min-h-screen flex-col">
      <a className="skip-link" href="#main">
        {m.skip}
      </a>
      <SiteHeader />
      <main id="main" className="flex-1">
        {children ?? <Outlet />}
      </main>
      <SiteFooter />
    </div>
  );
}
