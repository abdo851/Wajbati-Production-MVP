const CASABLANCA = "Africa/Casablanca";

export function todayInCasablanca(date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: CASABLANCA,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

const WEEKDAY_INDEX: Record<string, number> = { Mon: 0, Tue: 1, Wed: 2, Thu: 3, Fri: 4, Sat: 5, Sun: 6 };

export function weekStartInCasablanca(date = new Date()): string {
  const today = todayInCasablanca(date);
  const [year, month, day] = today.split("-").map(Number);
  const weekday = new Intl.DateTimeFormat("en-US", { timeZone: CASABLANCA, weekday: "short" }).format(date);
  const offset = WEEKDAY_INDEX[weekday] ?? 0;
  const start = new Date(Date.UTC(year, month - 1, day));
  start.setUTCDate(start.getUTCDate() - offset);
  return start.toISOString().slice(0, 10);
}

type UiLang = "ar" | "en" | "fr";

let activeLang: UiLang = "ar";

export function setFormatLang(lang: UiLang) {
  activeLang = lang;
}

function dateLocale(lang: UiLang): string {
  if (lang === "ar") return "ar-MA";
  if (lang === "fr") return "fr-FR";
  return "en-GB";
}

export function formatServiceDate(isoDate: string, lang: UiLang = activeLang): string {
  const [year, month, day] = isoDate.split("-").map(Number);
  if (!year || !month || !day) return isoDate;
  return new Intl.DateTimeFormat(dateLocale(lang), {
    timeZone: CASABLANCA,
    weekday: "long",
    day: "numeric",
    month: "long",
  }).format(new Date(Date.UTC(year, month - 1, day, 12)));
}

export function formatWhen(iso: string, lang: UiLang = activeLang): string {
  return new Intl.DateTimeFormat(dateLocale(lang), {
    timeZone: CASABLANCA,
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(iso));
}

export function formatMad(value: number, lang: UiLang = activeLang): string {
  return new Intl.NumberFormat(lang === "ar" ? "ar-MA" : "fr-MA", {
    style: "currency",
    currency: "MAD",
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(value);
}

export function roundMoney(value: number): number {
  return Math.round(value * 100) / 100;
}
