/**
 * This browser's identity key, sent once per connection in `hello` (application/identity.mts).
 *
 * In a secure context (https, localhost) it is the public half of an ECDSA P-256 key pair
 * whose private half cannot leave this browser (IndexedDB keeps the CryptoKey itself). A
 * plain-http LAN page has no WebCrypto, so it keeps a random 32-byte secret instead.
 * Either way only the host ever receives it; other players see the id derived from it.
 */
const DATABASE = 'cro-magnon-identity';
const STORE = 'keys';
const SECRET_KEY = 'cro-identity-secret';

export interface IdentityStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

const base64url = (bytes: Uint8Array) =>
  btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');

/** The plain-http identity: a random secret kept with the page's other preferences. */
export function secretIdentity(
  storage: IdentityStorage,
  random: (bytes: Uint8Array<ArrayBuffer>) => Uint8Array = (bytes) => crypto.getRandomValues(bytes),
): string | null {
  try {
    const saved = storage.getItem(SECRET_KEY);
    if (saved && /^[A-Za-z0-9_-]{43}$/.test(saved)) return saved;
    const secret = base64url(random(new Uint8Array(32)));
    storage.setItem(SECRET_KEY, secret);
    return secret;
  } catch {
    return null;
  }
}

function request<T>(operation: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    operation.onsuccess = () => resolve(operation.result);
    operation.onerror = () => reject(operation.error);
  });
}

async function keyPair(): Promise<CryptoKeyPair> {
  const open = indexedDB.open(DATABASE, 1);
  open.onupgradeneeded = () => open.result.createObjectStore(STORE);
  const db = await request(open);
  try {
    const saved = await request<CryptoKeyPair | undefined>(
      db.transaction(STORE, 'readonly').objectStore(STORE).get('current'),
    );
    if (saved?.publicKey && saved.privateKey) return saved;
    const created = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, false, [
      'sign',
      'verify',
    ]);
    const tx = db.transaction(STORE, 'readwrite');
    // Another tab may have created one first: keep that one, so the browser stays one person.
    const existing = await request<CryptoKeyPair | undefined>(tx.objectStore(STORE).get('current'));
    if (existing?.publicKey) return existing;
    tx.objectStore(STORE).put(created, 'current');
    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onabort = () => reject(tx.error);
    });
    return created;
  } finally {
    db.close();
  }
}

let current: Promise<string | null> | null = null;

/** The key to send, or null when this browser can keep none (private mode, blocked storage). */
export function browserIdentity(storage: () => IdentityStorage = () => localStorage) {
  return (current ??= (async () => {
    if (globalThis.isSecureContext && globalThis.crypto?.subtle && globalThis.indexedDB)
      try {
        const keys = await keyPair();
        return base64url(new Uint8Array(await crypto.subtle.exportKey('spki', keys.publicKey)));
      } catch {
        /* Fall back to the secret below. */
      }
    try {
      return secretIdentity(storage());
    } catch {
      return null;
    }
  })());
}
