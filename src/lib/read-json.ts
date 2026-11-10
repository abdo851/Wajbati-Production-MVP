import { localizeKnownError } from "@/lib/error-text";
import type { Lang } from "@/lib/i18n";

function browserLang(): Lang {
  if (typeof document === "undefined") return "ar";
  const lang = document.documentElement.lang;
  if (lang === "en" || lang === "fr" || lang === "ar") return lang;
  return "ar";
}

export async function readJson<T>(response: Response): Promise<T> {
  let body: { error?: string } = {};
  try {
    const text = await response.text();
    body = text ? (JSON.parse(text) as { error?: string }) : {};
  } catch {
    if (!response.ok) throw new Error(localizeKnownError(browserLang(), "Request failed."));
    throw new Error(localizeKnownError(browserLang(), "The server returned an unreadable response."));
  }
  if (!response.ok) {
    throw new Error(localizeKnownError(browserLang(), body.error || "Request failed."));
  }
  return body as T;
}
