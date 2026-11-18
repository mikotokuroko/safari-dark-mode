import type {SettingsV1} from '../shared/contracts';
import {DEFAULT_SETTINGS, SETTINGS_STORAGE_KEY, validateSettings} from '../shared/settings';
import {storageGet, storageSet} from '../shared/webextension';

let cachedSettings: SettingsV1 | undefined;

export async function readSettings(): Promise<SettingsV1> {
  if (cachedSettings !== undefined) {
    return cachedSettings;
  }
  const stored = await storageGet(SETTINGS_STORAGE_KEY);
  const validated = validateSettings(stored[SETTINGS_STORAGE_KEY]);
  if (JSON.stringify(stored[SETTINGS_STORAGE_KEY]) !== JSON.stringify(validated)) {
    await storageSet({[SETTINGS_STORAGE_KEY]: validated});
  }
  cachedSettings = validated;
  return validated;
}

export async function writeSettings(value: unknown): Promise<SettingsV1> {
  const settings = validateSettings(value);
  cachedSettings = settings;
  await storageSet({[SETTINGS_STORAGE_KEY]: settings});
  return settings;
}

export async function initializeSettings(): Promise<void> {
  const stored = await storageGet(SETTINGS_STORAGE_KEY);
  if (!(SETTINGS_STORAGE_KEY in stored)) {
    cachedSettings = DEFAULT_SETTINGS;
    await storageSet({[SETTINGS_STORAGE_KEY]: DEFAULT_SETTINGS});
  } else {
    await readSettings();
  }
}
