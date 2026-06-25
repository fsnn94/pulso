import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: "class",
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        sans: ["Inter", "system-ui", "sans-serif"],
        mono: ["JetBrains Mono", "ui-monospace", "monospace"],
      },
      colors: {
        ink: {
          50:  "#FAF5F1",
          100: "#E0DBD8",
          200: "#C9C2BB",
          300: "#B0A69D",
          400: "#9D9088",
          500: "#8F7A6E",
          600: "#6B5E54",
          700: "#4A4540",
          800: "#353A40",
          900: "#292F36",
          950: "#1E2329",
        },
        accent: { 500: "#A41F13", 600: "#8E1A11" },
        yes:    { 500: "#2D6A4F", 600: "#1B4D38" },
        no:     { 500: "#A41F13", 600: "#8E1A11" },
      },
    },
  },
  plugins: [],
};

export default config;
