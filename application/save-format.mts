/**
 * The saved world's layout. Version 2 keeps each player's progress once, at the top level,
 * and lets a room record only who belongs to it (a resume token and a player id). Version 1
 * nested the whole player inside the room it was last in; it is still read and upgraded.
 *
 * Player progress refers only to the shared world catalogue (regions, residents, countries),
 * never to one room's bodies, so the same record can enter any room of the same world.
 */
export const SAVE_VERSION = 2;
export const READABLE_SAVE_VERSIONS: readonly number[] = Object.freeze([1, 2]);

export interface SavedMembership {
  token: string;
  expiresAt: number;
  playerId: string;
}

/** A room's members with their player records attached: the shape the restore code reads. */
export interface ExpandedSession {
  token: string;
  expiresAt: number;
  player: Record<string, unknown> & { id: string };
}

export function saveVersionReadable(version: unknown): boolean {
  return typeof version === 'number' && READABLE_SAVE_VERSIONS.includes(version);
}

export function saveVersionNewer(version: unknown): boolean {
  return typeof version === 'number' && Number.isFinite(version) && version > SAVE_VERSION;
}

/**
 * Room records whose `sessions` carry their player records, from either version. The
 * input is not modified. A version 2 membership naming a missing player, or a player
 * claimed by two memberships, makes the save invalid instead of quietly losing someone.
 */
export function expandSavedRooms(saved: {
  version: number;
  rooms: unknown[];
  players?: unknown[];
}): any[] {
  const rooms = JSON.parse(JSON.stringify(saved.rooms));
  if (saved.version === 1) return rooms;
  if (!Array.isArray(saved.players)) throw new Error('Invalid saved players');
  const players = new Map<string, any>();
  for (const player of JSON.parse(JSON.stringify(saved.players))) {
    if (!player || typeof player.id !== 'string' || !player.id || players.has(player.id))
      throw new Error('Invalid saved player');
    players.set(player.id, player);
  }
  const claimed = new Set<string>();
  for (const room of rooms) {
    if (!room || !Array.isArray(room.sessions)) continue;
    room.sessions = room.sessions.map((entry: Partial<SavedMembership> | null) => {
      const id = entry?.playerId;
      const player = typeof id === 'string' ? players.get(id) : undefined;
      if (!entry || !player || claimed.has(player.id)) throw new Error('Invalid saved membership');
      claimed.add(player.id);
      return { token: entry.token, expiresAt: entry.expiresAt, player };
    });
  }
  return rooms;
}

/** Split expanded room records into the version 2 layout (each player once). */
export function collapseSavedRooms(rooms: any[]): { rooms: any[]; players: any[] } {
  const players = new Map<string, any>();
  const collapsed = rooms.map((room) => ({
    ...room,
    sessions: room.sessions.flatMap((entry: ExpandedSession) => {
      // One body per person: a second membership for the same player keeps the first.
      if (players.has(entry.player.id)) return [];
      players.set(entry.player.id, entry.player);
      return [{ token: entry.token, expiresAt: entry.expiresAt, playerId: entry.player.id }];
    }),
  }));
  return { rooms: collapsed, players: [...players.values()] };
}

/**
 * A saved room's members with their player records attached, without copying: editing a
 * returned `player` edits the save itself (for tools and fixtures). Reads either version.
 */
export function savedMembers(
  saved: { version: number; rooms: any[]; players?: any[] },
  roomIndex = 0,
): ExpandedSession[] {
  const room = saved.rooms[roomIndex];
  if (saved.version === 1) return room.sessions;
  const players = new Map((saved.players ?? []).map((player) => [player.id, player]));
  return room.sessions.map((entry: SavedMembership) => ({
    token: entry.token,
    expiresAt: entry.expiresAt,
    player: players.get(entry.playerId),
  }));
}
