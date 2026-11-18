import type {PageState, PageStatus, SettingsV1, SiteMode} from '../shared/contracts';
import {DEFAULT_SETTINGS, validateSettings, withSiteMode} from '../shared/settings';
import {queryTabs, sendRuntimeMessage} from '../shared/webextension';

const STATUS_LABELS: Readonly<Record<PageStatus, string>> = {
  darkened: 'Darkened (System dark)',
  'native-dark': 'Native dark theme detected — left untouched',
  'system-light': 'System light mode — left untouched',
  disabled: 'Light mode / Disabled',
  forced: 'Darkened (Forced dark)',
  unsupported: 'This page is unsupported',
  'access-unavailable': 'Website access is unavailable',
};

function element<T extends HTMLElement>(id: string): T {
  const value = document.getElementById(id);
  if (value === null) {
    throw new Error(`Missing popup element: ${id}`);
  }
  return value as T;
}

const enabledInput = element<HTMLInputElement>('enabled');
const hostnameText = element<HTMLElement>('hostname');
const statusText = element<HTMLElement>('status');
const resetButton = element<HTMLButtonElement>('reset');
const sliders = ['brightness', 'contrast', 'sepia'] as const;
let settings = DEFAULT_SETTINGS;
let hostname = '';
let activeTabId: number | undefined;

function render(): void {
  enabledInput.checked = settings.enabled;
  for (const name of sliders) {
    const input = element<HTMLInputElement>(name);
    const output = element<HTMLOutputElement>(`${name}-value`);
    input.value = String(settings[name]);
    output.value = String(settings[name]);
  }
  const siteFieldset = document.querySelector<HTMLFieldSetElement>('fieldset');
  if (siteFieldset !== null) {
    siteFieldset.disabled = hostname === '';
  }
  const mode = settings.siteModes[hostname] ?? 'auto';
  const radio = document.querySelector<HTMLInputElement>(`input[name="site-mode"][value="${mode}"]`);
  if (radio !== null) {
    radio.checked = true;
  }
}

async function refreshPageStatus(): Promise<void> {
  if (hostname === '' || activeTabId === undefined) {
    return;
  }
  const state = await sendRuntimeMessage<PageState | undefined>({type: 'get-page-state', tabId: activeTabId});
  statusText.textContent = state === undefined ? STATUS_LABELS['access-unavailable'] : STATUS_LABELS[state.status];
}

async function save(next: SettingsV1): Promise<void> {
  settings = validateSettings(await sendRuntimeMessage({type: 'replace-settings', settings: next}));
  render();
  await refreshPageStatus();
}

async function initialize(): Promise<void> {
  settings = validateSettings(await sendRuntimeMessage({type: 'get-settings'}));
  const tabs = await queryTabs({active: true, currentWindow: true});
  const tab = tabs[0];
  if (tab?.url !== undefined && /^https?:/.test(tab.url)) {
    hostname = new URL(tab.url).hostname.toLowerCase();
    activeTabId = tab.id;
    hostnameText.textContent = hostname;
    await refreshPageStatus();
  } else {
    statusText.textContent = STATUS_LABELS.unsupported;
  }
  render();
}

enabledInput.addEventListener('change', (): void => {
  void save({...settings, enabled: enabledInput.checked});
});

document.querySelectorAll<HTMLInputElement>('input[name="site-mode"]').forEach((input) => {
  input.addEventListener('change', (): void => {
    void save(withSiteMode(settings, hostname, input.value as SiteMode));
  });
});

for (const name of sliders) {
  const input = element<HTMLInputElement>(name);
  input.addEventListener('input', (): void => {
    element<HTMLOutputElement>(`${name}-value`).value = input.value;
  });
  input.addEventListener('change', (): void => {
    void save({...settings, [name]: Number(input.value)});
  });
}

resetButton.addEventListener('click', (): void => {
  void save({...settings, brightness: 100, contrast: 100, sepia: 0});
});

void initialize().catch(() => {
  statusText.textContent = STATUS_LABELS['access-unavailable'];
  render();
});
