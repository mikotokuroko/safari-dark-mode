import type {PageState, SettingsChangedMessage, SettingsV1} from '../shared/contracts';
import {createDebouncedTask} from '../shared/debounce';
import {decidePolicy} from '../shared/policy';
import {SETTINGS_STORAGE_KEY, validateSettings} from '../shared/settings';
import {detectNativeDark, observeThemeChanges} from './detector';
import {disableEngine, enableEngine} from './engine';
import {getDetectorHint} from './upstream-config';
import {sendRuntimeMessage, storageGet} from '../shared/webextension';

const PRELOAD_ID = 'safari-dark-mode-preload';
let settings: SettingsV1;
let themeObserver: MutationObserver | undefined;

function installPreload(): void {
  if (document.getElementById(PRELOAD_ID) !== null) {
    return;
  }
  const style = document.createElement('style');
  style.id = PRELOAD_ID;
  style.dataset.safariDarkMode = 'preload';
  style.textContent = ':root{background:#181a1b!important;color-scheme:dark}';
  (document.querySelector('head') ?? document.documentElement).append(style);
}

function removePreload(): void {
  document.getElementById(PRELOAD_ID)?.remove();
}

function report(state: PageState): void {
  if (window === window.top) {
    void sendRuntimeMessage({type: 'report-page-state', state}).catch(() => undefined);
  }
}

function getDarkColorSchemeQuery(): MediaQueryList | undefined {
  return typeof matchMedia === 'function' ? matchMedia('(prefers-color-scheme: dark)') : undefined;
}

function isSystemDark(): boolean {
  return getDarkColorSchemeQuery()?.matches ?? true;
}

function syncThemeObserver(shouldObserve: boolean): void {
  if (shouldObserve) {
    themeObserver ??= observeThemeChanges(document, debouncedReevaluation.schedule);
  } else if (themeObserver !== undefined) {
    themeObserver.disconnect();
    themeObserver = undefined;
  }
}

function reevaluate(): PageState {
  const hostname = location.hostname.toLowerCase();
  if (!/^https?:$/.test(location.protocol)) {
    syncThemeObserver(false);
    disableEngine();
    removePreload();
    const state: PageState = {hostname, status: 'unsupported'};
    report(state);
    return state;
  }
  const mode = settings.siteModes[hostname] ?? 'auto';
  const systemDark = isSystemDark();
  const shouldDetectNative = settings.enabled && mode === 'auto' && systemDark;
  syncThemeObserver(shouldDetectNative);
  const nativeDark = shouldDetectNative
    && document.querySelector('body') !== null && detectNativeDark(document, getDetectorHint(location.href));
  const decision = decidePolicy(settings, hostname, nativeDark, systemDark);
  if (decision.apply) {
    enableEngine(settings, location.href);
  } else {
    disableEngine();
  }
  removePreload();
  const state: PageState = {hostname, status: decision.status};
  report(state);
  return state;
}

const debouncedReevaluation = createDebouncedTask(reevaluate, 180);

function watchChanges(): void {
  for (const method of ['pushState', 'replaceState'] as const) {
    const original: (...args: Parameters<History[typeof method]>) => void = history[method].bind(history);
    history[method] = function (...args: Parameters<History[typeof method]>): void {
      original(...args);
      debouncedReevaluation.schedule();
    } as History[typeof method];
  }
  addEventListener('pageshow', debouncedReevaluation.schedule);
  document.addEventListener('DOMContentLoaded', debouncedReevaluation.schedule, {once: true});
  addEventListener('popstate', debouncedReevaluation.schedule);
  addEventListener('hashchange', debouncedReevaluation.schedule);
  getDarkColorSchemeQuery()?.addEventListener('change', debouncedReevaluation.schedule);
}

async function loadInitialSettings(): Promise<SettingsV1> {
  const storage = chrome.storage as typeof chrome.storage | undefined;
  if (storage?.local !== undefined) {
    const stored = await storageGet(SETTINGS_STORAGE_KEY);
    if (SETTINGS_STORAGE_KEY in stored) {
      return validateSettings(stored[SETTINGS_STORAGE_KEY]);
    }
  }
  return validateSettings(await sendRuntimeMessage({type: 'get-settings'}));
}

async function initialize(): Promise<void> {
  try {
    settings = await loadInitialSettings();
    reevaluate();
    watchChanges();
  } catch {
    removePreload();
    report({hostname: location.hostname.toLowerCase(), status: 'access-unavailable'});
  }
}

if (isSystemDark()) {
  installPreload();
}
void initialize();

chrome.runtime.onMessage.addListener((message: unknown, _sender, sendResponse): boolean => {
  const candidate = message as Partial<SettingsChangedMessage>;
  if (candidate.type === 'settings-changed') {
    settings = validateSettings(candidate.settings);
    const state = reevaluate();
    sendResponse(state);
    return false;
  }
  return false;
});

(chrome.storage as typeof chrome.storage | undefined)?.onChanged.addListener((changes, areaName): void => {
  const entry = changes[SETTINGS_STORAGE_KEY];
  if (areaName === 'local' && entry?.newValue !== undefined) {
    settings = validateSettings(entry.newValue);
    reevaluate();
  }
});
