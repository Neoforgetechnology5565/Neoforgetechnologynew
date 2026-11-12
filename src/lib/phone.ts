import { parsePhoneNumberFromString, type CountryCode } from "libphonenumber-js/min";

/** Validates a phone number against its country's numbering plan. Returns E.164 and an international display form, or null when invalid. */
export function checkPhone(national: string, country: string): { e164: string; display: string } | null {
  const raw = national.trim(); if (!raw) return null;
  const p = parsePhoneNumberFromString(raw, raw.startsWith("+") ? undefined : (country as CountryCode));
  return p && p.isValid() ? { e164: p.number, display: p.formatInternational() } : null;
}
