/**
 * A character to take to a shared room: possessions, tools and exploration, as the host
 * reads them (application/carried-profile.mts checks every field again). It travels as a
 * small file, because each site keeps its own browser storage: a solo save made on
 * cromagnonmmo.com cannot be read by a LAN host's page. On the same page the last solo
 * character is also remembered, so it can be taken along without a file.
 */
export const CARD_FORMAT = 'cro-magnon-character';
export const CARD_VERSION = 1;
const REMEMBERED = 'cro-solo-character';
const MAX_CARD_LENGTH = 12000;

export interface CharacterCard {
  format: typeof CARD_FORMAT;
  version: typeof CARD_VERSION;
  savedAt: number;
  name: string;
  character: string;
  progress: Record<string, unknown>;
}

const PROGRESS_FIELDS = [
  'inventory',
  'gathered',
  'tool',
  'equippedItem',
  'spearHead',
  'energy',
  'adventure',
  'gulf',
] as const;

/** A card from this player's own state as the host last sent it. */
export function characterCard(player: object | undefined, now = Date.now()): CharacterCard | null {
  const source = player as Record<string, unknown> | undefined;
  if (!source || typeof source.inventory !== 'object') return null;
  const progress = Object.fromEntries(
    PROGRESS_FIELDS.filter((key) => source[key] !== undefined).map((key) => [
      key,
      structuredClone(source[key]),
    ]),
  );
  return {
    format: CARD_FORMAT,
    version: CARD_VERSION,
    savedAt: now,
    name: typeof source.name === 'string' ? source.name.slice(0, 16) : '',
    character: typeof source.character === 'string' ? source.character : '',
    progress,
  };
}

/** A card read from a file or storage, or null when the text is not one. */
export function parseCharacterCard(text: unknown): CharacterCard | null {
  if (typeof text !== 'string' || text.length > MAX_CARD_LENGTH) return null;
  let value: Partial<CharacterCard>;
  try {
    value = JSON.parse(text);
  } catch {
    return null;
  }
  if (
    !value ||
    value.format !== CARD_FORMAT ||
    value.version !== CARD_VERSION ||
    !value.progress ||
    typeof value.progress !== 'object' ||
    typeof (value.progress as { inventory?: unknown }).inventory !== 'object'
  )
    return null;
  return {
    format: CARD_FORMAT,
    version: CARD_VERSION,
    savedAt: Number.isFinite(value.savedAt) ? Number(value.savedAt) : 0,
    name: typeof value.name === 'string' ? value.name.slice(0, 16) : '',
    character: typeof value.character === 'string' ? value.character : '',
    progress: value.progress as Record<string, unknown>,
  };
}

interface CardStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

/** Keep the current solo character for a later shared room on this same page. */
export function rememberSoloCharacter(card: CharacterCard | null, storage: () => CardStorage) {
  if (!card) return;
  try {
    const text = JSON.stringify(card);
    if (text.length <= MAX_CARD_LENGTH) storage().setItem(REMEMBERED, text);
  } catch {
    /* Remembering is a convenience; the file export still works. */
  }
}

export function rememberedSoloCharacter(storage: () => CardStorage): CharacterCard | null {
  try {
    return parseCharacterCard(storage().getItem(REMEMBERED));
  } catch {
    return null;
  }
}

/** Offer the card as a download named after the character. */
export function downloadCharacterCard(card: CharacterCard) {
  const blob = new Blob([JSON.stringify(card, null, 1)], { type: 'application/json' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = `cro-magnon-${(card.name || 'character').replace(/[\\/:*?"<>|\s]+/g, '_')}.json`;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(link.href), 1000);
}
