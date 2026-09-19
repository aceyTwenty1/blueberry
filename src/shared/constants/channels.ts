/** Central IPC channel name constants to avoid string typos */

export const IPC = {
  TABS_CREATE: 'tabs:create',
  TABS_CLOSE: 'tabs:close',
  TABS_ACTIVATE: 'tabs:activate',
  TABS_LIST: 'tabs:list',
  TABS_NAVIGATE: 'tabs:navigate',
  TABS_NAVIGATION: 'tabs:navigation',
  TABS_UPDATE: 'tabs:update',
  TABS_CHANGED: 'tabs:changed',
  TABS_UPDATED: 'tabs:updated',

  SPACES_LIST: 'spaces:list',
  SPACES_CREATE: 'spaces:create',
  SPACES_ACTIVATE: 'spaces:activate',

  BROWSER_GET_STATE: 'browser:getState',
  BROWSER_EXTRACT: 'browser:extractMarkdown',

  AI_LIST_PROVIDERS: 'ai:listProviders',
  AI_GET_PROVIDER: 'ai:getProvider',
  AI_SET_PROVIDER: 'ai:setProvider',
  AI_CHAT: 'ai:chat',
  AI_CHAT_STREAM: 'ai:chatStream',
  AI_CHUNK: 'ai:chunk',
  AI_ERROR: 'ai:error',

  APP_GET_VERSION: 'app:getVersion'
} as const
