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

type WrapperProps = {
  locale: AppLocale;
  children: ReactNode;
  // Production passes `messages={null}` at the root, so shell leaves must take strings as props. The
  // default mirrors that: a leaf that goes back to `useTranslations` fails here too. Pass
  // `withMessages` only to test a component that legitimately sits under a nested provider.
  withMessages?: boolean;
};

function throwOnIntlError(error: Error): never {
  throw error;
}

export function IntlWrapper({ locale, children, withMessages = false }: WrapperProps) {
  const dir = localeDirection(locale);
  return (
    <NextIntlClientProvider
      locale={locale}
      messages={withMessages ? catalogs[locale] : null}
      onError={throwOnIntlError}
      timeZone="UTC"
    >
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
        { href: "/scholarships", label: nav.scholarships, prefetch: false as const },
        { href: "/plan", label: nav.plan, savedCount: { template: nav.savedCount } },
      ],
    },
    clearData: { ...clearData },
  };
}

export function renderIntl(
  ui: ReactElement,
  locale: AppLocale = "fr",
  options: { withMessages?: boolean } = {},
) {
  return render(ui, {
    wrapper: ({ children }) => (
      <IntlWrapper locale={locale} withMessages={options.withMessages}>
        {children}
      </IntlWrapper>
    ),
  });
}
