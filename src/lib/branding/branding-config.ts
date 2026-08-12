/**
 * Smart EDMS — Branding Types
 *
 * Defines the customizable branding configuration stored in Tenant.settings.branding
 */

export interface BrandingConfig {
  appName: string;
  logo: string | null;
  primaryColor: string;
  primaryForegroundColor: string;
  accentColor: string;
  accentForegroundColor: string;
  chartColors: [string, string, string, string, string];
  sidebarColor: string;
  sidebarForegroundColor: string;
  loginTitle: string;
  loginSubtitle: string;
  loginBackgroundColor: string;
  emailHeaderColor: string;
  favicon: string | null;
}

export const DEFAULT_BRANDING: BrandingConfig = {
  appName: 'Smart EDMS',
  logo: null,
  primaryColor: 'oklch(0.205 0 0)',
  primaryForegroundColor: 'oklch(0.985 0 0)',
  accentColor: 'oklch(0.97 0 0)',
  accentForegroundColor: 'oklch(0.205 0 0)',
  chartColors: [
    'oklch(0.646 0.222 41.116)',
    'oklch(0.6 0.118 184.704)',
    'oklch(0.398 0.07 227.392)',
    'oklch(0.828 0.189 84.429)',
    'oklch(0.769 0.188 70.08)',
  ],
  sidebarColor: 'oklch(0.985 0 0)',
  sidebarForegroundColor: 'oklch(0.145 0 0)',
  loginTitle: 'Smart EDMS',
  loginSubtitle: 'Secure Document Governance Platform',
  loginBackgroundColor: 'oklch(0.145 0 0)',
  emailHeaderColor: 'oklch(0.205 0 0)',
  favicon: null,
};

export const COLOR_PRESETS: Array<{
  name: string;
  primary: string;
  primaryForeground: string;
  accent: string;
  accentForeground: string;
  chart: [string, string, string, string, string];
}> = [
  { name: 'Default (Black)', primary: 'oklch(0.205 0 0)', primaryForeground: 'oklch(0.985 0 0)', accent: 'oklch(0.97 0 0)', accentForeground: 'oklch(0.205 0 0)', chart: ['oklch(0.646 0.222 41.116)', 'oklch(0.6 0.118 184.704)', 'oklch(0.398 0.07 227.392)', 'oklch(0.828 0.189 84.429)', 'oklch(0.769 0.188 70.08)'] },
  { name: 'Indigo', primary: 'oklch(0.5 0.2 277)', primaryForeground: 'oklch(0.985 0 0)', accent: 'oklch(0.93 0.05 277)', accentForeground: 'oklch(0.3 0.15 277)', chart: ['oklch(0.55 0.22 277)', 'oklch(0.65 0.18 200)', 'oklch(0.45 0.1 250)', 'oklch(0.7 0.2 300)', 'oklch(0.6 0.15 330)'] },
  { name: 'Emerald', primary: 'oklch(0.5 0.15 160)', primaryForeground: 'oklch(0.985 0 0)', accent: 'oklch(0.93 0.05 160)', accentForeground: 'oklch(0.3 0.1 160)', chart: ['oklch(0.55 0.18 160)', 'oklch(0.6 0.15 180)', 'oklch(0.45 0.1 140)', 'oklch(0.7 0.2 120)', 'oklch(0.65 0.15 100)'] },
  { name: 'Royal Blue', primary: 'oklch(0.45 0.2 255)', primaryForeground: 'oklch(0.985 0 0)', accent: 'oklch(0.93 0.05 255)', accentForeground: 'oklch(0.3 0.15 255)', chart: ['oklch(0.5 0.22 255)', 'oklch(0.6 0.18 200)', 'oklch(0.4 0.1 230)', 'oklch(0.7 0.2 280)', 'oklch(0.55 0.15 300)'] },
  { name: 'Crimson', primary: 'oklch(0.5 0.2 25)', primaryForeground: 'oklch(0.985 0 0)', accent: 'oklch(0.93 0.05 25)', accentForeground: 'oklch(0.3 0.15 25)', chart: ['oklch(0.55 0.22 25)', 'oklch(0.6 0.18 0)', 'oklch(0.45 0.1 350)', 'oklch(0.7 0.2 30)', 'oklch(0.65 0.15 60)'] },
  { name: 'Amber', primary: 'oklch(0.55 0.15 75)', primaryForeground: 'oklch(0.15 0 0)', accent: 'oklch(0.93 0.08 75)', accentForeground: 'oklch(0.3 0.1 75)', chart: ['oklch(0.6 0.18 75)', 'oklch(0.55 0.15 50)', 'oklch(0.5 0.1 100)', 'oklch(0.7 0.2 30)', 'oklch(0.65 0.15 120)'] },
  { name: 'Teal', primary: 'oklch(0.5 0.12 190)', primaryForeground: 'oklch(0.985 0 0)', accent: 'oklch(0.93 0.04 190)', accentForeground: 'oklch(0.3 0.1 190)', chart: ['oklch(0.55 0.15 190)', 'oklch(0.6 0.12 170)', 'oklch(0.45 0.08 210)', 'oklch(0.7 0.18 150)', 'oklch(0.65 0.12 130)'] },
  { name: 'Purple', primary: 'oklch(0.5 0.2 305)', primaryForeground: 'oklch(0.985 0 0)', accent: 'oklch(0.93 0.05 305)', accentForeground: 'oklch(0.3 0.15 305)', chart: ['oklch(0.55 0.22 305)', 'oklch(0.6 0.18 330)', 'oklch(0.45 0.1 280)', 'oklch(0.7 0.2 350)', 'oklch(0.65 0.15 260)'] },
];

export function applyBranding(config: BrandingConfig): void {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  root.style.setProperty('--primary', config.primaryColor);
  root.style.setProperty('--primary-foreground', config.primaryForegroundColor);
  root.style.setProperty('--accent', config.accentColor);
  root.style.setProperty('--accent-foreground', config.accentForegroundColor);
  config.chartColors.forEach((color, i) => { root.style.setProperty(`--chart-${i + 1}`, color); });
  root.style.setProperty('--sidebar', config.sidebarColor);
  root.style.setProperty('--sidebar-foreground', config.sidebarForegroundColor);
  root.style.setProperty('--sidebar-primary', config.primaryColor);
  root.style.setProperty('--sidebar-primary-foreground', config.primaryForegroundColor);
  root.style.setProperty('--ring', config.primaryColor);
  document.title = config.appName;
  if (config.favicon) {
    const existing = document.querySelector("link[rel='icon']") as HTMLLinkElement | null;
    if (existing) { existing.href = config.favicon; }
    else { const link = document.createElement('link'); link.rel = 'icon'; link.href = config.favicon; document.head.appendChild(link); }
  }
  root.dataset.branded = 'true';
  root.dataset.appName = config.appName;
}

export function getBranding(settings: Record<string, unknown> | null | undefined): BrandingConfig {
  if (!settings || !settings.branding) return DEFAULT_BRANDING;
  return { ...DEFAULT_BRANDING, ...(settings.branding as Partial<BrandingConfig>) };
}
