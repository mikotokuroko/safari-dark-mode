import type {PageStatus, SettingsV1} from './contracts';

export interface PolicyDecision {
  readonly apply: boolean;
  readonly status: PageStatus;
}

export function decidePolicy(
  settings: SettingsV1,
  hostname: string,
  nativeDarkDetected: boolean,
  systemDark = true,
): PolicyDecision {
  if (!settings.enabled) {
    return {apply: false, status: 'disabled'};
  }
  const mode = settings.siteModes[hostname] ?? 'auto';
  if (mode === 'off') {
    return {apply: false, status: 'disabled'};
  }
  if (mode === 'force') {
    return {apply: true, status: 'forced'};
  }
  if (!systemDark) {
    return {apply: false, status: 'system-light'};
  }
  if (nativeDarkDetected) {
    return {apply: false, status: 'native-dark'};
  }
  return {apply: true, status: 'darkened'};
}
