import { networkInterfaces } from 'node:os';
import { HOME_RULES } from '../../shared/room-rules.mjs';

/** Shared play for a house or a LAN: `pnpm run start:lan` sets CRO_MULTIPLAYER=lan. */
export const LAN_DEFAULT_ROOM = 'HOME';
export const LAN_DEFAULT_PLAYER_LIMIT = 8;

export interface LanSettings {
  host: string;
  playerLimit: number;
  rules: typeof HOME_RULES;
  /** Served as /multiplayer-config.json: the page opens the room instead of solo play. */
  runtimeConfig: {
    mode: 'online';
    allowOnline: true;
    lan: true;
    serverUrl: '';
    room: string;
  };
}

/** The LAN host settings from the environment, or null for an ordinary (solo) start. */
export function lanSettings(env: Record<string, string | undefined>): LanSettings | null {
  if (env.CRO_MULTIPLAYER !== 'lan') return null;
  const limit = env.CRO_PLAYER_LIMIT ? Number(env.CRO_PLAYER_LIMIT) : LAN_DEFAULT_PLAYER_LIMIT;
  if (!Number.isInteger(limit) || limit < 1 || limit > 64)
    throw new Error('CRO_PLAYER_LIMIT must be an integer from 1 to 64');
  const room =
    (env.CRO_ROOM ?? '')
      .toUpperCase()
      .replace(/[^A-Z0-9_-]/g, '')
      .slice(0, 16) || LAN_DEFAULT_ROOM;
  return {
    // Other devices on the network reach this PC only when it listens on them.
    host: env.HOST || '0.0.0.0',
    playerLimit: limit,
    rules: Object.freeze({ ...HOME_RULES, playerLimit: limit }),
    runtimeConfig: { mode: 'online', allowOnline: true, lan: true, serverUrl: '', room },
  };
}

/** The addresses other devices on this network can open, e.g. http://192.168.1.20:3000. */
export function lanUrls(port: number): string[] {
  return [
    ...new Set(
      Object.values(networkInterfaces())
        .flat()
        .filter((item) => item && item.family === 'IPv4' && !item.internal)
        .map((item) => `http://${item!.address}:${port}`),
    ),
  ];
}
