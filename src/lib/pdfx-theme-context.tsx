import { type ReactNode, createContext, useContext } from "react";
import { theme as defaultTheme } from "./pdfx-theme";

type PdfxTheme = typeof defaultTheme;

export const PdfxThemeContext = createContext<PdfxTheme>(defaultTheme);

export interface PdfxThemeProviderProps {
  theme?: PdfxTheme;
  children: ReactNode;
}

export function PdfxThemeProvider({ theme, children }: PdfxThemeProviderProps) {
  const resolvedTheme = theme ?? defaultTheme;
  return (
    <PdfxThemeContext.Provider value={resolvedTheme}>
      {children}
    </PdfxThemeContext.Provider>
  );
}

export function usePdfxTheme(): PdfxTheme {
  return useContext(PdfxThemeContext);
}
