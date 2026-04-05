import type { Config } from "tailwindcss";

export default {
  darkMode: ["class"],
  content: ["./pages/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}", "./app/**/*.{ts,tsx}", "./src/**/*.{ts,tsx}"],
  prefix: "",
  theme: {
    container: {
      center: true,
      padding: "1rem",
      screens: {
        "2xl": "1400px",
      },
    },
    extend: {
      fontFamily: {
        sans: ['ui-sans-serif', 'system-ui', '-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'Roboto', 'Helvetica Neue', 'Arial', 'sans-serif'],
      },
      /** Typography scale: H1 24/700, Section/Header 18/600, Body 15/400–500, Subtext 13–14/muted */
      fontSize: {
        "typo-h1": ["1.5rem", { lineHeight: "1.25" }],       /* 24px */
        "typo-section": ["1.125rem", { lineHeight: "1.3" }], /* 18px */
        "typo-header": ["1.125rem", { lineHeight: "1.3" }],  /* 18px */
        "typo-title": ["1.125rem", { lineHeight: "1.3" }],
        "typo-body": ["0.9375rem", { lineHeight: "1.5" }],   /* 15px */
        "typo-subtext": ["0.8125rem", { lineHeight: "1.45" }], /* 13px */
        "typo-h2": ["0.875rem", { lineHeight: "1.4" }],
        "typo-muted": ["0.875rem", { lineHeight: "1.5" }],
        "typo-caption": ["0.75rem", { lineHeight: "1.4" }],
        "typo-button": ["1rem", { lineHeight: "1.25" }],
        /** Plan tab: премиум-типографика */
        "plan-hero-title": ["1.5rem", { lineHeight: "1.25" }],
        "plan-subheader": ["0.8125rem", { lineHeight: "1.4" }],
        "plan-meal-label": ["1rem", { lineHeight: "1.3" }],
        "plan-recipe-title": ["1.125rem", { lineHeight: "1.2" }],
        "plan-secondary": ["0.9375rem", { lineHeight: "1.45" }],
      },
      colors: {
        border: "var(--border)",
        input: "var(--input)",
        ring: "var(--ring)",
        background: "var(--background)",
        foreground: "var(--foreground)",
        primary: {
          DEFAULT: "var(--primary)",
          foreground: "var(--primary-foreground)",
          light: "var(--color-primary-light)",
          border: "var(--color-primary-border)",
        },
        "app-bg": "var(--color-bg-main)",
        "text-main": "var(--color-text-main)",
        secondary: {
          DEFAULT: "var(--secondary)",
          foreground: "var(--secondary-foreground)",
        },
        destructive: {
          DEFAULT: "var(--destructive)",
          foreground: "var(--destructive-foreground)",
        },
        muted: {
          DEFAULT: "var(--muted)",
          foreground: "var(--muted-foreground)",
        },
        accent: {
          DEFAULT: "var(--accent)",
          foreground: "var(--accent-foreground)",
        },
        popover: {
          DEFAULT: "var(--popover)",
          foreground: "var(--popover-foreground)",
        },
        card: {
          DEFAULT: "var(--card)",
          foreground: "var(--card-foreground)",
        },
        mint: {
          DEFAULT: "var(--mint)",
          light: "var(--mint-light)",
        },
        "primary-pill": "var(--primary-pill-surface)",
        peach: {
          DEFAULT: "var(--peach)",
          dark: "var(--peach-dark)",
        },
        lavender: {
          DEFAULT: "var(--lavender)",
          dark: "var(--lavender-dark)",
        },
        cream: "var(--cream)",
        "soft-pink": "var(--soft-pink)",
        "soft-blue": "var(--soft-blue)",
        sidebar: {
          DEFAULT: "var(--sidebar-background)",
          foreground: "var(--sidebar-foreground)",
          primary: "var(--sidebar-primary)",
          "primary-foreground": "var(--sidebar-primary-foreground)",
          accent: "var(--sidebar-accent)",
          "accent-foreground": "var(--sidebar-accent-foreground)",
          border: "var(--sidebar-border)",
          ring: "var(--sidebar-ring)",
        },
        "premium-star": "var(--premium-star)",
        splash: "var(--splash-bg)",
        "chat-surface": "var(--chat-surface-bg)",
        "chef-advice": "var(--chef-advice-bg)",
        "nav-muted": "var(--nav-inactive-fg)",
        "destructive-hover": "var(--destructive-hover-fg)",
      },
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
        "2xl": "1.5rem",
        "3xl": "2rem",
      },
      keyframes: {
        "accordion-down": {
          from: { height: "0" },
          to: { height: "var(--radix-accordion-content-height)" },
        },
        "accordion-up": {
          from: { height: "var(--radix-accordion-content-height)" },
          to: { height: "0" },
        },
        "fade-in": {
          from: { opacity: "0", transform: "translateY(10px)" },
          to: { opacity: "1", transform: "translateY(0)" },
        },
        "fade-in-up": {
          from: { opacity: "0", transform: "translateY(20px)" },
          to: { opacity: "1", transform: "translateY(0)" },
        },
        "scale-in": {
          from: { opacity: "0", transform: "scale(0.95)" },
          to: { opacity: "1", transform: "scale(1)" },
        },
        "slide-in-right": {
          from: { transform: "translateX(100%)" },
          to: { transform: "translateX(0)" },
        },
        "slide-in-bottom": {
          from: { transform: "translateY(100%)" },
          to: { transform: "translateY(0)" },
        },
        "bounce-soft": {
          "0%, 100%": { transform: "translateY(0)" },
          "50%": { transform: "translateY(-5px)" },
        },
        "pulse-soft": {
          "0%, 100%": { opacity: "1" },
          "50%": { opacity: "0.7" },
        },
        shimmer: {
          "0%": { transform: "translateX(-100%)" },
          "100%": { transform: "translateX(100%)" },
        },
      },
      animation: {
        "accordion-down": "accordion-down 0.2s ease-out",
        "accordion-up": "accordion-up 0.2s ease-out",
        "fade-in": "fade-in 0.3s ease-out",
        "fade-in-up": "fade-in-up 0.4s ease-out",
        "scale-in": "scale-in 0.2s ease-out",
        "slide-in-right": "slide-in-right 0.3s ease-out",
        "slide-in-bottom": "slide-in-bottom 0.3s ease-out",
        "bounce-soft": "bounce-soft 2s ease-in-out infinite",
        "pulse-soft": "pulse-soft 2s ease-in-out infinite",
        shimmer: "shimmer 1.6s linear infinite",
      },
    },
  },
  plugins: [require("tailwindcss-animate"), require("@tailwindcss/typography")],
} satisfies Config;
