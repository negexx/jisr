import { Geist, Noto_Sans_Arabic } from "next/font/google";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
// Not preloaded: Latin-only locales should not download Arabic glyphs.
const notoSansArabic = Noto_Sans_Arabic({
  variable: "--font-arabic",
  subsets: ["arabic"],
  preload: false,
});

// Shared by the [locale] layout and global-not-found, the two places that render <html>.
export const fontVariables = `${geistSans.variable} ${notoSansArabic.variable}`;
