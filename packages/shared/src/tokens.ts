export const radius = {
  baseRem: 0.875,
  smRem: 0.5,
  mdRem: 0.6875,
  lgRem: 0.875,
  xlRem: 1.25,
} as const;

export const motionDurations = {
  fastMs: 120,
  standardMs: 200,
  rewardMs: 560,
} as const;

export const motionEasings = {
  standard: [0.2, 0.8, 0.2, 1] as const,
  emphasized: [0.16, 1, 0.3, 1] as const,
};

export type ThemeTokenName =
  | "background"
  | "foreground"
  | "card"
  | "cardForeground"
  | "popover"
  | "popoverForeground"
  | "primary"
  | "primaryForeground"
  | "secondary"
  | "secondaryForeground"
  | "muted"
  | "mutedForeground"
  | "accent"
  | "accentForeground"
  | "destructive"
  | "border"
  | "input"
  | "ring";

export interface ColorToken {
  oklch: string;
  hex: string;
}

export const lightTheme: Record<ThemeTokenName, ColorToken> = {
  background: { oklch: "oklch(0.985 0.003 286)", hex: "#F8F7FB" },
  foreground: { oklch: "oklch(0.22 0.01 286)", hex: "#312F38" },
  card: { oklch: "oklch(0.995 0.002 286)", hex: "#FBFBFD" },
  cardForeground: { oklch: "oklch(0.22 0.01 286)", hex: "#312F38" },
  popover: { oklch: "oklch(0.995 0.002 286)", hex: "#FBFBFD" },
  popoverForeground: { oklch: "oklch(0.22 0.01 286)", hex: "#312F38" },
  primary: { oklch: "oklch(0.51 0.16 255)", hex: "#2F6FDB" },
  primaryForeground: { oklch: "oklch(0.985 0.003 286)", hex: "#F8F7FB" },
  secondary: { oklch: "oklch(0.94 0.01 286)", hex: "#ECEAF1" },
  secondaryForeground: { oklch: "oklch(0.3 0.01 286)", hex: "#45434D" },
  muted: { oklch: "oklch(0.95 0.008 286)", hex: "#F0EEF4" },
  mutedForeground: { oklch: "oklch(0.5 0.01 286)", hex: "#74717D" },
  accent: { oklch: "oklch(0.92 0.018 255)", hex: "#E4ECF8" },
  accentForeground: { oklch: "oklch(0.28 0.01 286)", hex: "#413F48" },
  destructive: { oklch: "oklch(0.6 0.21 28)", hex: "#D94A3A" },
  border: { oklch: "oklch(0.89 0.008 286)", hex: "#DDDBE3" },
  input: { oklch: "oklch(0.89 0.008 286)", hex: "#DDDBE3" },
  ring: { oklch: "oklch(0.55 0.16 255)", hex: "#3B78E0" },
};

export const darkTheme: Record<ThemeTokenName, ColorToken> = {
  background: { oklch: "oklch(0.19 0.01 286)", hex: "#1F1D24" },
  foreground: { oklch: "oklch(0.96 0.003 286)", hex: "#F3F2F6" },
  card: { oklch: "oklch(0.24 0.01 286)", hex: "#2B2931" },
  cardForeground: { oklch: "oklch(0.96 0.003 286)", hex: "#F3F2F6" },
  popover: { oklch: "oklch(0.24 0.01 286)", hex: "#2B2931" },
  popoverForeground: { oklch: "oklch(0.96 0.003 286)", hex: "#F3F2F6" },
  primary: { oklch: "oklch(0.72 0.13 255)", hex: "#7BA8F0" },
  primaryForeground: { oklch: "oklch(0.18 0.01 286)", hex: "#1C1A21" },
  secondary: { oklch: "oklch(0.31 0.01 286)", hex: "#3C3944" },
  secondaryForeground: { oklch: "oklch(0.96 0.003 286)", hex: "#F3F2F6" },
  muted: { oklch: "oklch(0.3 0.01 286)", hex: "#3A3742" },
  mutedForeground: { oklch: "oklch(0.75 0.01 286)", hex: "#B6B3BE" },
  accent: { oklch: "oklch(0.36 0.03 255)", hex: "#3E4B63" },
  accentForeground: { oklch: "oklch(0.96 0.003 286)", hex: "#F3F2F6" },
  destructive: { oklch: "oklch(0.72 0.19 25)", hex: "#F0715C" },
  border: { oklch: "oklch(0.36 0.01 286)", hex: "#4A4754" },
  input: { oklch: "oklch(0.36 0.01 286)", hex: "#4A4754" },
  ring: { oklch: "oklch(0.72 0.13 255)", hex: "#7BA8F0" },
};

export const cssTokenNames: Record<ThemeTokenName, string> = {
  background: "--background",
  foreground: "--foreground",
  card: "--card",
  cardForeground: "--card-foreground",
  popover: "--popover",
  popoverForeground: "--popover-foreground",
  primary: "--primary",
  primaryForeground: "--primary-foreground",
  secondary: "--secondary",
  secondaryForeground: "--secondary-foreground",
  muted: "--muted",
  mutedForeground: "--muted-foreground",
  accent: "--accent",
  accentForeground: "--accent-foreground",
  destructive: "--destructive",
  border: "--border",
  input: "--input",
  ring: "--ring",
};
