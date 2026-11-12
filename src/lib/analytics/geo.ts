/**
 * Approximate, IP-derived location. The hosting platform resolves the visitor's IP to a place and passes the result in request headers
 * (Vercel: x-vercel-ip-*). We never see, log or store the IP address, and this is a city-level estimate: it can be wrong, and VPNs or mobile
 * networks may place a visitor in another city or country. Precise (GPS) location is never requested.
 */
export interface Geo { country: string; region: string; regionName: string; city: string; lat: number | null; lon: number | null; ipTimezone: string; known: boolean }
export interface HeaderLike { get(name: string): string | null }

const US: Record<string, string> = { AL: "Alabama", AK: "Alaska", AZ: "Arizona", AR: "Arkansas", CA: "California", CO: "Colorado", CT: "Connecticut", DE: "Delaware", DC: "District of Columbia", FL: "Florida", GA: "Georgia", HI: "Hawaii", ID: "Idaho", IL: "Illinois", IN: "Indiana", IA: "Iowa", KS: "Kansas", KY: "Kentucky", LA: "Louisiana", ME: "Maine", MD: "Maryland", MA: "Massachusetts", MI: "Michigan", MN: "Minnesota", MS: "Mississippi", MO: "Missouri", MT: "Montana", NE: "Nebraska", NV: "Nevada", NH: "New Hampshire", NJ: "New Jersey", NM: "New Mexico", NY: "New York", NC: "North Carolina", ND: "North Dakota", OH: "Ohio", OK: "Oklahoma", OR: "Oregon", PA: "Pennsylvania", RI: "Rhode Island", SC: "South Carolina", SD: "South Dakota", TN: "Tennessee", TX: "Texas", UT: "Utah", VT: "Vermont", VA: "Virginia", WA: "Washington", WV: "West Virginia", WI: "Wisconsin", WY: "Wyoming", PR: "Puerto Rico" };
const CA: Record<string, string> = { AB: "Alberta", BC: "British Columbia", MB: "Manitoba", NB: "New Brunswick", NL: "Newfoundland and Labrador", NS: "Nova Scotia", NT: "Northwest Territories", NU: "Nunavut", ON: "Ontario", PE: "Prince Edward Island", QC: "Quebec", SK: "Saskatchewan", YT: "Yukon" };
const AU: Record<string, string> = { ACT: "Australian Capital Territory", NSW: "New South Wales", NT: "Northern Territory", QLD: "Queensland", SA: "South Australia", TAS: "Tasmania", VIC: "Victoria", WA: "Western Australia" };
const GB: Record<string, string> = { ENG: "England", SCT: "Scotland", WLS: "Wales", NIR: "Northern Ireland" };
const REGIONS: Record<string, Record<string, string>> = { US, CA, AU, GB };

/** Name of a state, province or region; the code itself when the name is not known to us. */
export function regionName(country: string, region: string): string { return REGIONS[country]?.[region] ?? region; }
export function countryName(code: string): string {
  if (!/^[A-Z]{2}$/.test(code) || code === "XX" || code === "ZZ") return "Unknown";
  try { return new Intl.DisplayNames(["en"], { type: "region" }).of(code) ?? code; } catch { return code; }
}
const text = (v: string | null, n: number) => (v ?? "").replace(/[\u0000-\u001f<>]/g, "").trim().slice(0, n);
export function geoFromHeaders(h: HeaderLike): Geo {
  let cc = (h.get("x-vercel-ip-country") || h.get("cf-ipcountry") || "").trim().toUpperCase(); if (!/^[A-Z]{2}$/.test(cc) || cc === "XX" || cc === "T1") cc = "";
  const region = text(h.get("x-vercel-ip-country-region"), 8).toUpperCase();
  let city = ""; try { city = text(decodeURIComponent(h.get("x-vercel-ip-city") ?? ""), 60); } catch { city = ""; }
  const num = (k: string) => { const n = parseFloat(h.get(k) ?? ""); return Number.isFinite(n) ? Math.round(n * 10) / 10 : null; }; // 0.1 degree is about 11 km
  const tz = text(h.get("x-vercel-ip-timezone"), 40), ipTimezone = /^[A-Za-z]+(\/[A-Za-z_+-]+)*$/.test(tz) ? tz : "";
  return { country: cc, region: cc ? region : "", regionName: cc && region ? regionName(cc, region) : "", city: cc ? city : "", lat: cc ? num("x-vercel-ip-latitude") : null, lon: cc ? num("x-vercel-ip-longitude") : null, ipTimezone, known: !!cc };
}
/** "City, Region, Country", or "Unknown". */
export function placeName(g: { country: string; regionName?: string; region?: string; city?: string }): string {
  if (!g.country || g.country === "XX") return "Unknown";
  return [g.city, g.regionName || g.region, countryName(g.country)].filter(Boolean).join(", ");
}
