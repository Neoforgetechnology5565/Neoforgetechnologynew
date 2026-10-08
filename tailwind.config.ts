import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // "ink" = surfaces (white → pale blue), "paper" = text (navy). Names kept from the original dark theme.
        ink: { 950: "#ffffff", 900: "#f3f7fd", 800: "#e8effb", 700: "#d9e4f7", 600: "#c3d3ee" },
        forge: { DEFAULT: "#1d5bd8", soft: "#3f7cf0", dim: "#1546ad" },
        signal: { DEFAULT: "#0891b2", dim: "#0e7490" },
        paper: { DEFAULT: "#0b1f3f", 200: "#1c3560", 300: "#3a5384" },
      },
      fontFamily: {
        sans: ["Georgia", "Cambria", "'Times New Roman'", "serif"],
        display: ["Georgia", "Cambria", "'Times New Roman'", "serif"],
        mono: ["var(--font-geist-mono)", "ui-monospace", "SFMono-Regular", "monospace"],
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
