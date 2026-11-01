import { ADVENTURE_REGIONS } from '../shared/adventure-regions.mjs';
import { COUNTRIES, GULF_STOPS } from '../shared/gulf-region.mjs';

/**
 * A character a newcomer brings from their own solo save (rules.acceptCarriedProfiles).
 * Only progress is taken: possessions, tools and what they have explored. Name, look,
 * companions and the arrival point come from the join itself. Everything is rebuilt from
 * known fields and ranges, so a damaged or edited file cannot stop the host's world.
 */
export const MAX_CARRIED_BYTES = 12000;

const INVENTORY_KEYS = [
  'wood',
  'stone',
  'berry',
  'rawMeat',
  'cookedMeat',
  'obsidian',
  'seed',
  'water',
  'rootSeed',
  'herbSeed',
  'rawRoot',
  'herb',
  'cookedRoot',
  'herbRoot',
  'rawShellfish',
  'cookedShellfish',
  'shells',
  'obsidianBlade',
  'rawFish',
  'cookedFish',
  'boat',
] as const;
const EQUIPMENT = ['axe', 'spear', 'obsidianSpear', 'character'] as const;

type Record_ = Record<string, unknown>;
const record = (value: unknown): Record_ | null =>
  value && typeof value === 'object' && !Array.isArray(value) ? (value as Record_) : null;
const count = (value: unknown, max: number) =>
  typeof value === 'number' && Number.isFinite(value)
    ? Math.max(0, Math.min(max, Math.floor(value)))
    : 0;
const ids = (value: unknown, known: readonly string[], max = 64) =>
  Array.isArray(value)
    ? [
        ...new Set(
          value.filter((id): id is string => typeof id === 'string' && known.includes(id)),
        ),
      ].slice(0, max)
    : [];
const names = (value: unknown, max = 64) =>
  Array.isArray(value)
    ? [
        ...new Set(
          value.filter(
            (id): id is string => typeof id === 'string' && id.length > 0 && id.length <= 64,
          ),
        ),
      ].slice(0, max)
    : [];
const dayMap = (value: unknown) =>
  Object.fromEntries(
    Object.entries(record(value) ?? {})
      .filter(
        ([key, day]) =>
          key.length <= 64 &&
          Number.isSafeInteger(day) &&
          (day as number) > 0 &&
          (day as number) < 1e9,
      )
      .slice(0, 64),
  ) as Record<string, number>;

export interface CarriedProfile {
  inventory: Record<string, number>;
  gathered: number;
  tool: boolean;
  equippedItem?: (typeof EQUIPMENT)[number];
  spearHead: 'wood' | 'obsidian';
  energy: number;
  adventure: {
    regions: Record<
      string,
      {
        visited: string[];
        gathered: number;
        kills: number;
        defeated: string[];
        claimed: boolean;
        discovered?: boolean;
      }
    >;
  };
  gulf: Record<string, unknown>;
}

/** The progress in a carried record, or null when it is not a player record at all. */
export function carriedProfile(value: unknown): CarriedProfile | null {
  const source = record(value);
  const inventory = record(source?.inventory);
  if (!source || !inventory) return null;
  const regions: CarriedProfile['adventure']['regions'] = {};
  const savedRegions = record(record(source.adventure)?.regions) ?? {};
  for (const region of ADVENTURE_REGIONS) {
    const progress = record(savedRegions[region.id]);
    if (!progress) continue;
    regions[region.id] = {
      visited: names(progress.visited, 16),
      gathered: count(progress.gathered, region.amount),
      kills: count(progress.kills, 1000),
      defeated: names(progress.defeated, 64),
      claimed: progress.claimed === true,
      ...(progress.discovered === true ? { discovered: true } : {}),
    };
  }
  const gulf = record(source.gulf) ?? {};
  const countryId = COUNTRIES.some((country) => country.id === gulf.countryId)
    ? (gulf.countryId as string)
    : null;
  const equipped = EQUIPMENT.find((item) => item === source.equippedItem);
  return {
    inventory: Object.fromEntries(INVENTORY_KEYS.map((key) => [key, count(inventory[key], 99)])),
    gathered: count(source.gathered, 1e9),
    tool: source.tool === true,
    ...(equipped ? { equippedItem: equipped } : {}),
    spearHead: source.spearHead === 'obsidian' ? 'obsidian' : 'wood',
    energy: Math.max(1, count(source.energy ?? 100, 100)),
    adventure: { regions },
    gulf: {
      countryId,
      welcomed: gulf.welcomed === true,
      visited: names(gulf.visited, 64),
      harvested: count(gulf.harvested, 1e9),
      procured: count(gulf.procured, 1e9),
      delivered: count(gulf.delivered, 1e9),
      lastFeast: count(gulf.lastFeast, 1e9),
      fishingKit: gulf.fishingKit === true,
      shellfishGathered: count(gulf.shellfishGathered, 1e9),
      shellsReturned: count(gulf.shellsReturned, 1e9),
      bladesKnapped: count(gulf.bladesKnapped, 1e9),
      fishCaught: count(gulf.fishCaught, 1e9),
      fishShared: count(gulf.fishShared, 1e9),
      waymarks: ids(
        gulf.waymarks,
        GULF_STOPS.map((stop) => stop.id),
      ),
      trailRewarded: gulf.trailRewarded === true,
      // Checked against the residents and households by ensureVillageProgress on arrival.
      metResidents: names(gulf.metResidents, 64),
      residentHelp: dayMap(gulf.residentHelp),
      householdWelcomes: dayMap(gulf.householdWelcomes),
      ...(record(gulf.pantryAllowance) ? { pantryAllowance: gulf.pantryAllowance } : {}),
    },
  };
}
