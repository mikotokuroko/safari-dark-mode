import {fetchResource} from './resource-fetch';
import {initializeSettings, readSettings, writeSettings} from './storage';
import {isRuntimeRequest} from '../shared/contracts';
import type {PageState, RuntimeRequest, SettingsChangedMessage} from '../shared/contracts';
import {createTab, queryTabs, sendTabMessage} from '../shared/webextension';

const pageStates = new Map<number, PageState>();

async function broadcastSettings(settings: SettingsChangedMessage['settings']): Promise<void> {
  const tabs = await queryTabs({});
  await Promise.all(tabs.flatMap((tab) => {
    const tabId = tab.id;
    if (tabId === undefined) {
      return [];
    }
    return [
      sendTabMessage<PageState | undefined>(tabId, {type: 'settings-changed', settings} satisfies SettingsChangedMessage)
        .then((state) => {
          if (state !== undefined && typeof state.status === 'string') {
            pageStates.set(tabId, state);
          }
        })
        .catch(() => undefined),
    ];
  }));
}

async function handleRequest(
  request: RuntimeRequest,
  sender: chrome.runtime.MessageSender,
): Promise<unknown> {
  switch (request.type) {
    case 'resource-fetch': {
      const senderUrl = sender.tab?.url;
      if (sender.id !== chrome.runtime.id || sender.tab === undefined || senderUrl === undefined || !/^https?:\/\//.test(senderUrl)) {
        return {ok: false, code: 'invalid-url', message: 'Resource requests are accepted only from HTTP(S) content scripts.'};
      }
      return fetchResource(request.url);
    }
    case 'get-settings':
      return readSettings();
    case 'replace-settings': {
      const settings = await writeSettings(request.settings);
      await broadcastSettings(settings);
      return settings;
    }
    case 'report-page-state':
      if (sender.tab?.id !== undefined) {
        pageStates.set(sender.tab.id, request.state);
      }
      return {ok: true};
    case 'get-page-state':
      return pageStates.get(request.tabId);
  }
}

chrome.runtime.onMessage.addListener((message: unknown, sender, sendResponse): boolean => {
  if (!isRuntimeRequest(message)) {
    return false;
  }
  void handleRequest(message, sender).then(sendResponse).catch((error: unknown) => {
    const text = error instanceof Error ? error.message : 'Unexpected background error';
    sendResponse({error: text});
  });
  return true;
});

chrome.runtime.onInstalled.addListener((details): void => {
  void initializeSettings();
  if (details.reason === 'install') {
    void createTab({url: chrome.runtime.getURL('onboarding/index.html')});
  }
});

chrome.tabs.onRemoved.addListener((tabId): void => {
  pageStates.delete(tabId);
});

void initializeSettings();
