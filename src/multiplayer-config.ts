import { parseControllerLayout, type ControllerLayout } from '../shared/controller-layout.mjs';

export interface MultiplayerConfig {
  mode: 'solo' | 'online' | 'lan';
  serverUrl: string;
  room?: string;
  guestName?: string;
  buildId?: string;
  controllerLayout?: ControllerLayout;
  movementRefreshMs?: number;
  /** The host really runs the shared game (a LAN host); without it `online` means solo. */
  allowOnline?: boolean;
  /** Served by `pnpm run start:lan`: people on the same network share the room. */
  lan?: boolean;
}

export function parseMultiplayerConfig(value: unknown): MultiplayerConfig {
  if (!value || typeof value !== 'object') throw new Error('接続設定を読み込めません。');
  const config = value as Record<string, unknown>;
  if (!['solo', 'lan', 'online'].includes(String(config.mode)))
    throw new Error('MULTIPLAYER_MODE は solo、lan、online のいずれかにしてください。');
  const serverUrl = typeof config.serverUrl === 'string' ? config.serverUrl : '';
  if (
    config.movementRefreshMs !== undefined &&
    (!Number.isInteger(config.movementRefreshMs) ||
      Number(config.movementRefreshMs) < 70 ||
      Number(config.movementRefreshMs) > 140)
  )
    throw new Error('移動の送信間隔が不正です。');
  if (config.mode === 'lan' && !serverUrl) throw new Error('LANサーバーURLが未設定です。');
  if (serverUrl) {
    const url = new URL(serverUrl);
    if (!['ws:', 'wss:'].includes(url.protocol) || url.username || url.password || url.hash)
      throw new Error('接続先は認証情報を含まない ws:// または wss:// URLにしてください。');
    if (config.mode === 'lan' && url.protocol !== 'ws:')
      throw new Error('展示LANでは ws:// を使用してください。');
  }
  return {
    mode: config.mode as MultiplayerConfig['mode'],
    serverUrl,
    room: typeof config.room === 'string' ? config.room : undefined,
    guestName: typeof config.guestName === 'string' ? config.guestName : undefined,
    buildId: typeof config.buildId === 'string' ? config.buildId : undefined,
    controllerLayout: parseControllerLayout(config.controllerLayout),
    ...(config.allowOnline === true ? { allowOnline: true } : {}),
    ...(config.lan === true ? { lan: true } : {}),
    ...(config.movementRefreshMs === undefined
      ? {}
      : { movementRefreshMs: Number(config.movementRefreshMs) }),
  };
}

export function multiplayerUrl(
  config: MultiplayerConfig,
  origin: string,
  params: Record<string, string>,
) {
  if (config.mode === 'solo') throw new Error('Solo play has no network connection');
  const url = new URL(config.serverUrl || '/ws', origin.replace(/^http/, 'ws'));
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
  if (config.mode === 'lan') url.searchParams.set('build', config.buildId || '');
  return url.href;
}

export function multiplayerSessionKey(config: MultiplayerConfig, room: string) {
  return config.mode === 'solo'
    ? 'solo:SOLO'
    : config.mode === 'lan'
      ? `lan:${config.serverUrl}:${room}`
      : room;
}

/** The page's query asks for solo play on a host that also offers the shared room. */
export const SOLO_QUERY = 'play';

/**
 * What this page plays. Online play needs the host's explicit `allowOnline` (a LAN host):
 * the public site's file says `online` without it, and older deployments' cached files
 * too, so they keep playing solo. `?play=solo` picks solo on a host that offers both.
 */
export function effectiveMultiplayerConfig(
  config: MultiplayerConfig,
  search = '',
): MultiplayerConfig {
  if (config.mode === 'lan') return config;
  const solo = { ...config, mode: 'solo' as const, serverUrl: '', room: 'SOLO' };
  if (config.mode !== 'online' || config.allowOnline !== true) return solo;
  return new URLSearchParams(search).get(SOLO_QUERY) === 'solo' ? solo : config;
}

/** Both kinds of play are offered here (a LAN host): the title links between them. */
export const offersSharedPlay = (config: MultiplayerConfig) => config.allowOnline === true;

export async function loadMultiplayerConfig(
  search = globalThis.location?.search ?? '',
): Promise<MultiplayerConfig> {
  const response = await fetch('/multiplayer-config.json', {
    cache: 'no-store',
    signal: AbortSignal.timeout(8000),
  });
  // Old online deployments do not yet have a runtime config file.
  if (response.status === 404) return { mode: 'solo', serverUrl: '', room: 'SOLO' };
  if (!response.ok) throw new Error('接続設定を読み込めません。起動ウィンドウを確認してください。');
  return effectiveMultiplayerConfig(parseMultiplayerConfig(await response.json()), search);
}
