/**
 * The client's copy of the world, built from what the host sends. Today every `state`
 * frame carries all players, animals and enemies, and the world fields (resources, camp,
 * gulf) only when they changed. A `delta` frame (Phase 1, docs/multiplayer-plan.md) carries
 * only the bodies that changed and the ones that left, so far-away or unchanged ones are
 * not resent. Code that reads the world reads it here, never from a single frame.
 */
export const ENTITY_LISTS = [
  'players',
  'animals',
  'enemies',
  'boats',
  'residents',
  'companions',
  'orbBots',
  'projectiles',
] as const;
export type EntityList = (typeof ENTITY_LISTS)[number];

interface Entity {
  id: string;
}
export type WorldState = Record<string, unknown> & { players: Entity[] };

export interface StateFrame extends Record<string, unknown> {
  type: 'state';
}
export interface DeltaFrame extends Record<string, unknown> {
  type: 'delta';
  /** Bodies that appeared or changed, by list. */
  upsert?: Partial<Record<EntityList, Entity[]>>;
  /** Ids of bodies that left, by list. */
  remove?: Partial<Record<EntityList, string[]>>;
}

/** The world after one frame. The previous world is not modified. */
export function applyFrame(world: WorldState, frame: StateFrame | DeltaFrame): WorldState {
  if (frame.type === 'state') {
    // Fields a frame leaves out (the slow-changing world) keep their last value.
    const { type: _type, ...fields } = frame;
    return { ...world, ...fields } as WorldState;
  }
  const { type: _type, upsert = {}, remove = {}, ...fields } = frame;
  const next = { ...world, ...fields } as WorldState;
  for (const list of ENTITY_LISTS) {
    const changed = upsert[list] ?? [];
    const gone = new Set(remove[list] ?? []);
    if (!changed.length && !gone.size) continue;
    const byId = new Map(((world[list] as Entity[] | undefined) ?? []).map((e) => [e.id, e]));
    for (const id of gone) byId.delete(id);
    // An update replaces the whole body: frames never describe half of one.
    for (const entity of changed) byId.set(entity.id, entity);
    (next as Record<string, unknown>)[list] = [...byId.values()];
  }
  return next;
}

export const isWorldFrame = (message: { type?: unknown }): message is StateFrame | DeltaFrame =>
  message.type === 'state' || message.type === 'delta';
