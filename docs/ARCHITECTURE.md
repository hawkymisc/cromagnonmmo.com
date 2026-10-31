# Architecture and TypeScript

Runtime source is TypeScript. Browser files use `.ts` → `.js`; ESM simulation and server files use `.mts` → `.mjs`. Imports name the emitted extension, so Node and the browser execute the same modules without a runtime transpiler. `dist/` is disposable build output; edit the source, never the emitted files.

## Responsibilities

| Location | Owns | Dependencies |
| --- | --- | --- |
| `shared/` | Game rules, movement, collision, world data, character definitions, public snapshots | Other domain modules |
| `application/` | Room/session lifecycle, action coordination, command decoding, snapshot serialization | Domain and application-owned ports |
| `infrastructure/node/` | HTTP static-file delivery, cache headers and path restrictions | Node APIs |
| `server.mts` | Node HTTP/WebSocket composition and process lifecycle | Application, domain, Node adapter |
| `cloudflare/` | Durable Object storage, socket delivery, free usage limits | Application and Cloudflare APIs |
| `src/` | Browser UI, input, storage and Three.js rendering | Domain and browser adapters |

Dependencies point toward the domain. `scripts/check-architecture.mjs` checks imports and rejects browser/Node globals in domain and application modules. Adapters, tools and tests create the game through `application/game-core.mjs`.

`createGameCore` receives a `Runtime` for time, IDs and session tokens. Its `GameConnection` interface describes communication without importing `ws` or a Worker socket. `decodeCommand` turns unknown JSON into a discriminated command union and drops client-authored authority such as damage and identity. Actions retain server-side cost, distance, collision and rate checks.

`createGameServer({ core })` permits an already-created/restored application core to be hosted by Node. The default still creates a fresh in-memory core. This injection does **not** add automatic disk persistence. The restoration integration test uses the application's existing save format and reconnect tokens.

Public snapshots have a shared schema separate from private session data. Browser session storage has a small storage interface and keeps the existing memory fallback when browser storage is denied. The Cloudflare socket adapter queues responses until the Worker explicitly flushes them after a successful save.

## Commands

```sh
pnpm install
pnpm run build
pnpm start
pnpm run dev
pnpm test
pnpm run check
pnpm run format:check
pnpm run build:cloudflare
pnpm run check:cloudflare
pnpm run cook
pnpm run bake:world
```

Models and runtime textures are delivered as cooked derivatives of the adopted masters (`scripts/delivery/`). The masters in `public/models` and their manifests stay the source of truth; the package builders check them exactly as before, then ship content-addressed `*.cook-<sha16>.*` files with manifests rewritten to name them. `pnpm run cook` (also run before `pnpm start` and once by `pnpm run dev`) prepares `dist/delivery/overlay.json`, through which the local server sends the same files; `CRO_DELIVERY=masters` sends the masters.

World data the runtime would otherwise derive on every load (the shoreline grids, the measured walk surfaces, the scenery scatter's answers) is baked by `scripts/bake-world-data.mjs` into `shared/*-baked.mts` and verified against its sources by `tests/world-bake.test.mjs`. Re-run `pnpm run bake:world` after changing those sources.

`start` and `test` build first. `dev` watches TypeScript and CSS, rebuilds, and restarts its own server only after a successful build. It keeps the previous server running on compiler errors and saves before its own restart. `dev:local` selects loopback port 3100 and a dedicated verification save directory; the legacy 3000 entry stays compatible.

Environment capabilities live in `shared/environment-profile.mts`. Release builders emit their own browser profile and audit the emitted import graph. MMO replaces the `hand-controls` entry with a disabled implementation and excludes hand recognition modules/assets entirely. The game also contains exhibition-mode code. MMO local preview verifies assets and Worker modules and uses its own local Cloudflare persistence.

`node server.mjs` is a compatibility launcher after a build. QA and generation scripts that import compiled runtime modules require `pnpm run build` before they are invoked directly. Data generators write `.mts` source; rebuild after generating data.

The local server serves `/src/*` and `/shared/*` from `dist/`, while models and other static assets stay in `public/`. CSS is copied without transformation. `build:cloudflare` packages compiled browser/domain modules and verifies GLB hashes. Its build report is written to `output/cloudflare-build.json`. It refuses unexpected stale output; use a fresh output directory when the asset catalog changes.

## Type checking scope

All runtime modules are compiled and structurally type-checked with `noEmitOnError`. `tsconfig.strict.json` additionally enables **all strict checks** for the command decoder, connection/runtime ports, public data schemas, character definitions, spatial index, frame clock, browser storage, Three.js type guards, static-file adapter, and quota/socket adapters. These modules contain no `any` annotations or suppressed diagnostics.

The remaining migrated simulation/rendering modules use the compatibility compiler settings in `tsconfig.json`; implicit parameter types and some dynamic rendering records remain permissive. This is not a claim of repository-wide strict typing. Extend explicit domain and rendering types before adding those modules to the strict project. No `@ts-ignore`, `@ts-nocheck`, blanket module shims, or `noCheck` build is used.

`tsconfig.cloudflare.json` separates Workers globals from Node/DOM globals. `cloudflare/env.d.ts` is generated from Wrangler configuration; refresh it with `pnpm run types:cloudflare` when bindings change. Generated terrain and model measurements retain their numeric data and are excluded from cosmetic formatting.

## Builds and validation

Builds and dry runs do not deploy or change billing. The Cloudflare adapter enforces Workers Free restrictions and handles save failures.
