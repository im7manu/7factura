import type { Config } from "tailwindcss";

const v = (name: string) => `rgb(var(--${name}) / <alpha-value>)`;

export default {
  darkMode: ["class"],
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        sans: ["var(--fuente)"],
      },
      colors: {
        canvas: v("canvas"),
        surface: v("surface"),
        subtle: v("subtle"),
        stroke: v("stroke"),
        fg: v("fg"),
        muted: v("muted"),
        brand: { DEFAULT: v("brand"), hover: v("brand-hover"), fg: v("brand-fg"), soft: v("brand-soft"), on: v("brand-on") },
        suite: { DEFAULT: v("suite"), fg: v("suite-fg") },
        danger: v("danger"),
        success: v("success"),
        warning: v("warning"),
        tile: {
          blue: "var(--tile-blue)", teal: "var(--tile-teal)", purple: "var(--tile-purple)", orange: "var(--tile-orange)",
          green: "var(--tile-green)", magenta: "var(--tile-magenta)", slate: "var(--tile-slate)",
        },
      },
      // Forma y profundidad controladas por el tema (variables CSS)
      borderRadius: { DEFAULT: "var(--radio)", md: "calc(var(--radio) * 1.5)", lg: "calc(var(--radio) * 2)" },
      boxShadow: { card: "var(--sombra-card)", flyout: "var(--sombra-flyout)" },
    },
  },
  plugins: [],
} satisfies Config;
