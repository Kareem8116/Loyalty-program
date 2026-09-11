/**
 * Phase 9.5 & 9.5.2: Business Branding, Layout Variants & Contrast Verification
 * 
 * Rules:
 * 1. layout_variant MUST be one of predefined variants ('centered-classic', 'qr-top', 'horizontal-offers').
 * 2. font_family MUST be selected from the approved font list (Inter, Roboto, Cairo, Tajawal).
 * 3. Color contrast check against WCAG AA standards (minimum 4.5:1 for normal text).
 */

export type LayoutVariant = 'centered-classic' | 'qr-top' | 'horizontal-offers';

export const APPROVED_FONTS = [
  'Inter',
  'Roboto',
  'Cairo',
  'Tajawal',
] as const;

export type ApprovedFont = (typeof APPROVED_FONTS)[number];

export interface BusinessBranding {
  id: string;
  business_id: string;
  display_name: string | null;
  logo_url: string | null;
  primary_color: string;
  accent_color: string;
  font_family: ApprovedFont | string;
  layout_variant: LayoutVariant;
  created_at: string;
  updated_at: string;
}

export const DEFAULT_BRANDING = {
  primary_color: '#FAF7F2',
  accent_color: '#B08968',
  font_family: 'Inter',
  layout_variant: 'centered-classic' as LayoutVariant,
};

/**
 * Converts a hex color (#RRGGBB or #RGB) to sRGB [0..1]
 */
function parseHex(hex: string): [number, number, number] {
  let clean = hex.replace(/^#/, '').trim();
  if (clean.length === 3) {
    clean = clean.split('').map((c) => c + c).join('');
  }
  if (clean.length !== 6) {
    return [0, 0, 0];
  }
  const r = parseInt(clean.substring(0, 2), 16) / 255;
  const g = parseInt(clean.substring(2, 4), 16) / 255;
  const b = parseInt(clean.substring(4, 6), 16) / 255;
  return [r, g, b];
}

/**
 * Calculates relative luminance as defined by WCAG 2.1
 */
export function getRelativeLuminance(hex: string): number {
  const [r, g, b] = parseHex(hex);
  const a = [r, g, b].map((v) => {
    return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
  });
  return a[0] * 0.2126 + a[1] * 0.7152 + a[2] * 0.0722;
}

/**
 * Calculates contrast ratio between two colors (returns value between 1:1 and 21:1)
 */
export function getContrastRatio(color1: string, color2: string): number {
  const lum1 = getRelativeLuminance(color1);
  const lum2 = getRelativeLuminance(color2);
  const brightest = Math.max(lum1, lum2);
  const darkest = Math.min(lum1, lum2);
  return (brightest + 0.05) / (darkest + 0.05);
}

export interface ContrastCheckResult {
  ratio: number;
  passesAA: boolean; // >= 4.5:1
  bestTextColor: '#000000' | '#FFFFFF';
  warning?: string;
  suggestedColor?: string;
}

/**
 * Phase 9.5.2: Accessibility Contrast Check (WCAG AA compliant)
 * Checks contrast against target text color (default #FFFFFF for buttons/badges or provided text color)
 */
export function checkColorContrast(bgColor: string, targetTextColor: string = '#FFFFFF'): ContrastCheckResult {
  const contrastWithWhite = getContrastRatio(bgColor, '#FFFFFF');
  const contrastWithBlack = getContrastRatio(bgColor, '#000000');

  const bestTextColor = contrastWithBlack >= contrastWithWhite ? '#000000' : '#FFFFFF';
  const evaluatedRatio = getContrastRatio(bgColor, targetTextColor);
  const passesAA = evaluatedRatio >= 4.5;

  let warning: string | undefined;
  let suggestedColor: string | undefined;

  if (!passesAA) {
    warning = `Warning: Selected color has low contrast ratio (${evaluatedRatio.toFixed(2)}:1) against ${targetTextColor}. WCAG AA requires at least 4.5:1.`;
    const lum = getRelativeLuminance(bgColor);
    suggestedColor = lum > 0.5 ? '#7A583A' : '#FAF7F2';
  }

  return {
    ratio: Number(evaluatedRatio.toFixed(2)),
    passesAA,
    bestTextColor,
    warning,
    suggestedColor,
  };
}

/**
 * Auto-slugify business name to a safe, unique subdomain (Phase 9.4)
 */
export function slugifySubdomain(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, '') // remove special chars
    .replace(/[\s_-]+/g, '-') // collapse whitespace and dashes
    .replace(/^-+|-+$/g, ''); // trim leading/trailing dashes
}
