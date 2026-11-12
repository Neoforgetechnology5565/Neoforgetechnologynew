/** Coarse device, browser and OS categories from a User-Agent. The raw string is never stored. */
export interface Ua { device: "desktop" | "mobile" | "tablet"; browser: string; os: string }
export function parseUa(ua: string): Ua {
  const u = ua || "";
  const device: Ua["device"] = /iPad|Tablet|PlayBook|Silk/i.test(u) || (/Android/i.test(u) && !/Mobile/i.test(u)) ? "tablet" : /Mobi|iPhone|iPod|Android/i.test(u) ? "mobile" : "desktop";
  const os = /Windows/i.test(u) ? "Windows" : /iPhone|iPad|iPod/i.test(u) ? "iOS" : /Android/i.test(u) ? "Android" : /CrOS/i.test(u) ? "ChromeOS" : /Mac OS X|Macintosh/i.test(u) ? "macOS" : /Linux|X11/i.test(u) ? "Linux" : "Other";
  const browser = /Edg(e|A|iOS)?\//i.test(u) ? "Edge" : /OPR\/|Opera/i.test(u) ? "Opera" : /SamsungBrowser/i.test(u) ? "Samsung Internet" : /Firefox|FxiOS/i.test(u) ? "Firefox" : /CriOS|Chrome|Chromium/i.test(u) ? "Chrome" : /Safari/i.test(u) ? "Safari" : "Other";
  return { device, browser, os };
}
