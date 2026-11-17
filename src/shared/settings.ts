import type {SettingsV1, SiteMode} from './contracts';

export const DEFAULT_SETTINGS: SettingsV1 = Object.freeze({
  schemaVersion: 1,
  enabled: true,
  brightness: 100,
  contrast: 100,
  sepia: 0,
  siteModes: Object.freeze({}),
});

function numberInRange(value: unknown, minimum: number, maximum: number, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value)
    ? Math.min(maximum, Math.max(minimum, Math.round(value)))
    : fallback;
}

export function normalizeHostname(value: string): string {
  const trimmed = value.trim().toLowerCase().replace(/\.$/, '');
  if (trimmed.length === 0 || trimmed.includes('/') || trimmed.includes(':')) {
    return '';
  }
  try {
    return new URL(`https://${trimmed}/`).hostname.toLowerCase();
  } catch {
    return '';
  }
}

function normalizeSiteModes(value: unknown): Readonly<Record<string, SiteMode>> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return {};
  }
  const modes: Record<string, SiteMode> = {};
  for (const [rawHostname, rawMode] of Object.entries(value as Readonly<Record<string, unknown>>)) {
    const hostname = normalizeHostname(rawHostname);
    if (hostname !== '' && (rawMode === 'auto' || rawMode === 'off' || rawMode === 'force')) {
      if (rawMode !== 'auto') {
        modes[hostname] = rawMode;
      }
    }
  }
  return modes;
}

export function validateSettings(value: unknown): SettingsV1 {
  const candidate = typeof value === 'object' && value !== null && !Array.isArray(value)
    ? value as Readonly<Record<string, unknown>>
    : {};
  return {
    schemaVersion: 1,
    enabled: typeof candidate.enabled === 'boolean' ? candidate.enabled : DEFAULT_SETTINGS.enabled,
    brightness: numberInRange(candidate.brightness, 50, 150, DEFAULT_SETTINGS.brightness),
    contrast: numberInRange(candidate.contrast, 50, 150, DEFAULT_SETTINGS.contrast),
    sepia: numberInRange(candidate.sepia, 0, 100, DEFAULT_SETTINGS.sepia),
    siteModes: normalizeSiteModes(candidate.siteModes),
  };
}

export function withSiteMode(settings: SettingsV1, rawHostname: string, mode: SiteMode): SettingsV1 {
  const hostname = normalizeHostname(rawHostname);
  if (hostname === '') {
    return settings;
  }
  if (mode === 'auto') {
    const siteModes = Object.fromEntries(
      Object.entries(settings.siteModes).filter(([existingHostname]) => existingHostname !== hostname),
    );
    return {...settings, siteModes};
  }
  const siteModes: Record<string, SiteMode> = {...settings.siteModes, [hostname]: mode};
  return {...settings, siteModes};
}
