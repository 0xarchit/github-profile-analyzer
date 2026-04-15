interface PdfxTheme {
  name: string;
  primitives: {
    typography: Record<string, number>;
    spacing: Record<string | number, number>;
    fontWeights: {
      regular: number;
      medium: number;
      semibold: number;
      bold: number;
    };
    lineHeights: { tight: number; normal: number; relaxed: number };
    borderRadius: {
      none: number;
      sm: number;
      md: number;
      lg: number;
      full: number;
    };
    letterSpacing: {
      tight: number;
      normal: number;
      wide: number;
      wider: number;
    };
  };
  colors: {
    foreground: string;
    background: string;
    muted: string;
    mutedForeground: string;
    primary: string;
    primaryForeground: string;
    border: string;
    accent: string;
    destructive: string;
    success: string;
    warning: string;
    info: string;
  };
  typography: {
    body: { fontFamily: string; fontSize: number; lineHeight: number };
    heading: {
      fontFamily: string;
      fontWeight: number;
      lineHeight: number;
      fontSize: {
        h1: number;
        h2: number;
        h3: number;
        h4: number;
        h5: number;
        h6: number;
      };
    };
  };
  spacing: {
    page: {
      marginTop: number;
      marginRight: number;
      marginBottom: number;
      marginLeft: number;
    };
    sectionGap: number;
    paragraphGap: number;
    componentGap: number;
  };
  page: {
    size: "A4" | "LETTER" | "LEGAL";
    orientation: "portrait" | "landscape";
  };
}

export const theme: PdfxTheme = {
  name: "professional",

  primitives: {
    typography: {
      xs: 10,
      sm: 12,
      base: 15,
      lg: 18,
      xl: 22,
      "2xl": 28,
      "3xl": 36,
    },
    spacing: {
      0: 0,
      0.5: 2,
      1: 4,
      2: 8,
      3: 12,
      4: 16,
      5: 20,
      6: 24,
      8: 32,
      10: 40,
      12: 48,
      16: 64,
    },
    fontWeights: {
      regular: 400,
      medium: 500,
      semibold: 600,
      bold: 700,
    },
    lineHeights: {
      tight: 1.2,
      normal: 1.4,
      relaxed: 1.6,
    },
    borderRadius: {
      none: 0,
      sm: 2,
      md: 4,
      lg: 8,
      full: 9999,
    },
    letterSpacing: {
      tight: -0.025,
      normal: 0,
      wide: 0.025,
      wider: 0.05,
    },
  },

  colors: {
    foreground: "#18181b",
    background: "#ffffff",
    muted: "#f4f4f5",
    mutedForeground: "#71717a",
    primary: "#18181b",
    primaryForeground: "#ffffff",
    border: "#e4e4e7",
    accent: "#3b82f6",
    destructive: "#dc2626",
    success: "#81c784",
    warning: "#fde047",
    info: "#4fc3f7",
  },

  typography: {
    body: {
      fontFamily: "Helvetica",
      fontSize: 11,
      lineHeight: 1.6,
    },
    heading: {
      fontFamily: "Times-Roman",
      fontWeight: 700,
      lineHeight: 1.25,
      fontSize: {
        h1: 32,
        h2: 24,
        h3: 20,
        h4: 16,
        h5: 14,
        h6: 12,
      },
    },
  },

  spacing: {
    page: {
      marginTop: 56,
      marginRight: 48,
      marginBottom: 56,
      marginLeft: 48,
    },
    sectionGap: 28,
    paragraphGap: 10,
    componentGap: 14,
  },

  page: {
    size: "A4",
    orientation: "portrait",
  },
};
