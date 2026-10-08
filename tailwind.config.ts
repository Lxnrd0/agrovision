import type { Config } from "tailwindcss";
export default {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  darkMode: "class",
  theme: {
    extend: { colors: { emerald: { 400: "#a8e879", 500: "#91d45f" } } },
  },
  plugins: [],
} satisfies Config;
