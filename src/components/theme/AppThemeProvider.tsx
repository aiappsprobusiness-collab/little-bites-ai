import { ThemeProvider } from "next-themes";
import type { ReactNode } from "react";
import { LB_THEME_STORAGE_KEY } from "@/constants/themeStorage";

export function AppThemeProvider({ children }: { children: ReactNode }) {
  return (
    <ThemeProvider
      attribute="class"
      defaultTheme="light"
      enableSystem={false}
      storageKey={LB_THEME_STORAGE_KEY}
      disableTransitionOnChange
    >
      {children}
    </ThemeProvider>
  );
}
