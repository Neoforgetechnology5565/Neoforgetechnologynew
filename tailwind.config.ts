import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: { 950: "#06080c", 900: "#0a0e14", 800: "#0f151d", 700: "#17202b", 600: "#243040" },
        forge: { DEFAULT: "#ff6a1a", soft: "#ff8a4a", dim: "#c4500f" },
        signal: { DEFAULT: "#35e0c2", dim: "#1f8f7c" },
        paper: { DEFAULT: "#f4f5f2", 200: "#e6e8e2", 300: "#cfd3ca" },
      },
      fontFamily: {
        sans: ["var(--font-geist-sans)", "ui-sans-serif", "system-ui", "sans-serif"],
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
