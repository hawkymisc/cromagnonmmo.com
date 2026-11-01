import { savedMembers } from '../../dist/application/save-format.mjs';

/**
 * A saved room's members with their player records attached. Version 2 saves keep each
 * player once beside the rooms (application/save-format.mts); the records returned here
 * are those same objects, so a test may edit them before restoring the save.
 */
export const savedSessions = savedMembers;

/** The same save in the version 1 layout (players inside their rooms): a fixture of an
 * older save, which the game still reads and upgrades. */
export function legacySave(state) {
  const copy = structuredClone(state);
  if (copy.version === 1) return copy;
  const rooms = copy.rooms.map((room, index) => ({
    ...room,
    sessions: savedMembers(copy, index).map(({ token, expiresAt, player }) => ({
      token,
      expiresAt,
      player,
    })),
  }));
  const { players: _players, ...rest } = copy;
  return { ...rest, version: 1, rooms };
}
