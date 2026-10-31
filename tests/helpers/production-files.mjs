import { existsSync, readFileSync } from 'node:fs';

// Optional production inputs are not included in a normal checkout.
// Tests name their exact required files and skip explicitly when any are absent.
export function productionFiles(...files) {
  const absent = files.filter((file) => !existsSync(file));
  return (
    absent.length > 0 &&
    `needs production files kept outside the public repository: ${absent.join(', ')}`
  );
}

/** The manifest-selected model of a character, mascot or prop (`public/models/<key>/asset.json`). */
export function modelPath(key) {
  const { url } = JSON.parse(readFileSync(`public/models/${key}/asset.json`, 'utf8'));
  if (typeof url !== 'string') throw new Error(`public/models/${key}/asset.json names no model`);
  return `public${url}`;
}

/** productionFiles() for the current models of `keys`: those of withheld and dormant characters
 * are among the files a clone does not have. */
export function modelFiles(...keys) {
  return productionFiles(...keys.map(modelPath));
}
