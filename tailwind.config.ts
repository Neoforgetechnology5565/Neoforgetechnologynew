import type { Config } from "tailwindcss";

// Brand palette taken from the logo: black lettering + signature green (#5bc236).
const green = { 50: "#f3fbec", 100: "#e3f6d3", 200: "#c8ecaa", 300: "#a3de78", 400: "#7acf48", 500: "#55b52b", 600: "#34821d", 700: "#2a6a18", 800: "#22541a", 900: "#1c4417", 950: "#0f2a0c" };
// Neutral greys (no blue tint) so dark areas read as logo-black.
const neutral = { 50: "#f7f7f7", 100: "#f0f0f0", 200: "#e3e3e3", 300: "#cfcfcf", 400: "#a3a3a3", 500: "#6b6b6b", 600: "#4a4a4a", 700: "#333333", 800: "#1f1f1f", 900: "#141414", 950: "#0a0a0a" };

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // The public pages use Tailwind's blue-* / slate-* classes: remapped here to the logo's green and black.
        blue: green,
        slate: neutral,
        // "ink" = surfaces (white → pale green-grey), "paper" = text (logo black). Names kept from the original dark theme.
        ink: { 950: "#ffffff", 900: "#f6faf3", 800: "#edf5e8", 700: "#dfecd6", 600: "#c9dcbc" },
        forge: { DEFAULT: "#34821d", soft: "#55b52b", dim: "#2a6a18" },
        signal: { DEFAULT: "#5bc236", dim: "#46a329" },
        paper: { DEFAULT: "#0b0b0b", 200: "#262626", 300: "#525252" },
      },
      fontFamily: {
        sans: ["Georgia", "Cambria", "'Times New Roman'", "serif"],
        display: ["Georgia", "Cambria", "'Times New Roman'", "serif"],
        // Georgia everywhere: even "mono" utility classes resolve to the Georgia stack so no component falls back to another family.
        mono: ["Georgia", "Cambria", "'Times New Roman'", "serif"],
      },
      keyframes: {
        scan: { "0%": { transform: "translateY(-10%)" }, "100%": { transform: "translateY(110%)" } },
        pulseDot: { "0%,100%": { opacity: "1" }, "50%": { opacity: ".35" } },
        rise: { "0%": { opacity: "0", transform: "translateY(14px)" }, "100%": { opacity: "1", transform: "none" } },
        dash: { to: { strokeDashoffset: "-24" } },
      },
      animation: {
        scan: "scan 5s linear infinite",
        pulseDot: "pulseDot 2s ease-in-out infinite",
        rise: "rise .7s cubic-bezier(.2,.7,.2,1) both",
        dash: "dash 1.4s linear infinite",
      },
    },
  },
  plugins: [],
};
export default config;
