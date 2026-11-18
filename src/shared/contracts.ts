export type SiteMode = 'auto' | 'off' | 'force';

export interface SettingsV1 {
  readonly schemaVersion: 1;
  readonly enabled: boolean;
  readonly brightness: number;
  readonly contrast: number;
  readonly sepia: number;
  readonly siteModes: Readonly<Record<string, SiteMode>>;
}

export type PageStatus =
  | 'darkened'
  | 'native-dark'
  | 'system-light'
  | 'disabled'
  | 'forced'
  | 'unsupported'
  | 'access-unavailable';

export interface PageState {
  readonly hostname: string;
  readonly status: PageStatus;
}

export interface ResourceFetchRequest {
  readonly type: 'resource-fetch';
  readonly url: string;
}

export type ResourceFetchErrorCode =
  | 'invalid-url'
  | 'http-error'
  | 'timeout'
  | 'too-large'
  | 'network-error';

export interface ResourceFetchSuccess {
  readonly ok: true;
  readonly status: number;
  readonly finalUrl: string;
  readonly contentType: string;
  readonly bytesBase64: string;
}

export interface ResourceFetchFailure {
  readonly ok: false;
  readonly code: ResourceFetchErrorCode;
  readonly message: string;
}

export type ResourceFetchResult = ResourceFetchSuccess | ResourceFetchFailure;

export interface GetSettingsRequest {
  readonly type: 'get-settings';
}

export interface ReplaceSettingsRequest {
  readonly type: 'replace-settings';
  readonly settings: unknown;
}

export interface GetPageStateRequest {
  readonly type: 'get-page-state';
  readonly tabId: number;
}

export interface ReportPageStateRequest {
  readonly type: 'report-page-state';
  readonly state: PageState;
}

export interface SettingsChangedMessage {
  readonly type: 'settings-changed';
  readonly settings: SettingsV1;
}

export type RuntimeRequest =
  | ResourceFetchRequest
  | GetSettingsRequest
  | ReplaceSettingsRequest
  | GetPageStateRequest
  | ReportPageStateRequest;

export function isRuntimeRequest(value: unknown): value is RuntimeRequest {
  if (typeof value !== 'object' || value === null || !('type' in value)) {
    return false;
  }
  const type = (value as {readonly type: unknown}).type;
  return typeof type === 'string' && [
    'resource-fetch',
    'get-settings',
    'replace-settings',
    'get-page-state',
    'report-page-state',
  ].includes(type);
}
