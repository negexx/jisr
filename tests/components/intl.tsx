import { render } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { ReactElement, ReactNode } from "react";

import { DirectionProvider } from "@/components/direction-provider";
import { localeDirection } from "@/i18n/direction";
import type { AppLocale } from "@/i18n/routing";
import ar from "../../messages/ar.json";
import en from "../../messages/en.json";
import fr from "../../messages/fr.json";

const catalogs = { fr, en, ar };

export function IntlWrapper({ locale, children }: { locale: AppLocale; children: ReactNode }) {
  const dir = localeDirection(locale);
  return (
    <NextIntlClientProvider locale={locale} messages={catalogs[locale]} timeZone="UTC">
      <div dir={dir} data-testid="dir-root">
        <DirectionProvider dir={dir}>{children}</DirectionProvider>
      </div>
    </NextIntlClientProvider>
  );
}

// The shell's client leaves take formatted strings as props; tests build them from the real catalogues.
export function shellProps(locale: AppLocale) {
  const { nav, clearData } = catalogs[locale];
  return {
    nav: {
      label: nav.label,
      items: [
        { href: "/profile", label: nav.profile },
        { href: "/matches", label: nav.matches },
      ],
    },
    clearData: { ...clearData },
  };
}

export function renderIntl(ui: ReactElement, locale: AppLocale = "fr") {
  return render(ui, {
    wrapper: ({ children }) => <IntlWrapper locale={locale}>{children}</IntlWrapper>,
  });
}
