import {disable, enable, setFetchMethod} from '../vendor/darkreader/darkreader.mjs';
import type {ResourceFetchResult, SettingsV1} from '../shared/contracts';
import {getDynamicThemeFix} from './upstream-config';
import {sendRuntimeMessage} from '../shared/webextension';

function decodeBase64(value: string): Uint8Array<ArrayBuffer> {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

export async function proxiedFetch(url: string): Promise<Response> {
  const result = await sendRuntimeMessage<ResourceFetchResult>({type: 'resource-fetch', url});
  if (!result.ok) {
    console.warn(`[Safari Dark Mode] ${result.code}: ${result.message}`);
    throw new Error(result.message);
  }
  return new Response(decodeBase64(result.bytesBase64), {
    status: result.status,
    headers: {'content-type': result.contentType},
  });
}

setFetchMethod(proxiedFetch);

let activeTheme = '';

export function enableEngine(settings: SettingsV1, url: string): void {
  const hostname = new URL(url).hostname.toLowerCase();
  const key = JSON.stringify([settings.brightness, settings.contrast, settings.sepia, hostname]);
  if (activeTheme === key) {
    return;
  }
  enable({
    mode: 1,
    brightness: settings.brightness,
    contrast: settings.contrast,
    sepia: settings.sepia,
  }, getDynamicThemeFix(url));
  activeTheme = key;
}

export function disableEngine(): void {
  if (activeTheme !== '') {
    disable();
    activeTheme = '';
  }
}
