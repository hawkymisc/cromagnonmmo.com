# GLB and texture optimization tools

These optional offline tools derive delivery files from verified model and texture inputs.
They preserve the recorded model identities, rig, animation and material constraints.
Normal gameplay and release builds use the adopted manifests; they do not generate or adopt
new candidates.

## Requirements

- Install the dependencies with `pnpm install --frozen-lockfile` and run `pnpm run build`.
- Texture conversion needs Python with Pillow. Select it with `--python`,
  `OPTIMIZATION_PYTHON` or `PERFORMANCE_PYTHON`. The fallback is `python` on Windows or
  `python3` elsewhere, resolved through PATH.
- The encoder is pinned to `meshoptimizer@1.1.1`. Browser delivery uses the verified decoder
  bundled with Three.js.
- Supply the model inputs, manifests and review evidence required by the selected operation.
  Some production inputs are not included in a checkout. Missing or mismatched inputs cause an
  error; the tools do not substitute another model or manufacture an acceptance record.

## Generate and verify candidates

Use a new output directory for changed inputs or settings. The examples below use an output
directory that must not already contain different candidate bytes.

```sh
pnpm run build
node --test tests/asset-optimization.test.mjs
node scripts/optimization/generate-candidates.mjs --out output/model-candidates --dry-run
node scripts/optimization/generate-candidates.mjs --out output/model-candidates
node scripts/optimization/verify-candidates.mjs --revision output/model-candidates --write-report
```

`--dry-run` verifies and plans without writing candidates or running Python. Generation writes
candidate files and their manifests, not runtime manifests under `public/`.

Useful generation options:

| Option                   | Purpose                                                              |
| ------------------------ | -------------------------------------------------------------------- |
| `--python <exe>`         | Choose Python with Pillow                                            |
| `--python-unisolated`    | Allow Pillow from user site-packages instead of Python isolation     |
| `--edge-512 key,...`     | Limit all texture maps of selected models to 512 px                  |
| `--maps-512 key,...`     | Limit normal and data maps to 512 px while keeping colour at 1024 px |
| `--webp-quality <1-100>` | Select lossy WebP quality; default 90                                |
| `--color-filter <name>`  | Select the colour resize filter                                      |
| `--only key,...`         | Select models; requires a separate output directory                  |
| `--base-adoption <id>`   | Derive a partial revision from a verified applied adoption           |
| `--recipe exact-repack`  | Losslessly repack the files served by an applied base adoption       |

The two 512 px options cannot select the same model. Output is restricted to new directories
under `assets/optimized-runtime/` or `output/`; path traversal and escaping links are rejected.

## Adopt reviewed candidates

Generation and structural verification do not establish visual acceptance. Review the rendered
candidate in the game, including faces, seams, poses and texture boundaries, and record the
acceptance for that exact revision before planning an adoption.

```sh
node scripts/optimization/adopt-candidates.mjs --plan --revision=output/model-candidates --adoption=example-adoption --acceptance=output/model-review.md --dry-run
node scripts/optimization/adopt-candidates.mjs --plan --revision=output/model-candidates --adoption=example-adoption --acceptance=output/model-review.md
node scripts/optimization/adopt-candidates.mjs --apply --adoption=example-adoption
node scripts/optimization/adopt-candidates.mjs --audit --adoption=example-adoption --write-report
```

The review file in this example is an input supplied by the reviewer. The planner hashes the
acceptance files and binds them to the candidate and manifest inputs. A partial revision also
requires its applied base through `--base-adoption` and its own acceptance files.

- Planning writes a new record under `assets/runtime-adoption/<id>/` with the before/after
  manifests, graph and journal. It does not change `public/`.
- Apply recomputes the plan, verifies its inputs, copies candidates to content-addressed names
  and updates only manifests whose bytes still match the planned inputs.
- Apply updates files individually. An interrupted operation is recorded and rejected by the
  build until it has been resolved; it is not treated as a successful transaction.
- Audit verifies the recorded graph, file identities and current manifests without changing them.
- `--restore --adoption=<id>` restores recorded manifests only while their current bytes match
  the adoption. It refuses unrelated edits and leaves copied candidate files in place.

Required adoption metadata must accompany the manifests that reference it. Candidate source
images, review evidence and other optional inputs are separate from the files the game serves.

## Validation rules

- Catalog and per-model manifests must agree. Model and texture bytes must match their recorded
  SHA-256 and length before processing.
- Texture conversion preserves format, alpha, colour handling, aspect ratio and UV meaning;
  it does not upscale, redraw or repack artwork.
- Meshopt streams must decode to the recorded bytes. Unsupported layouts are rejected rather
  than silently reinterpreted.
- Startup geometry retains full-model head primitives and whole single-primitive actors where
  required. Other supported primitives use source-derived simplification with locked seams and
  copied vertex attributes. Diagnostic geometry policies are not adopted as normal candidates.
- Rig topology, inverse binds, skinning displacement, primitive correspondence and material
  pairing are checked by `verify.mjs`. The limits are defined in `startup-actor.mjs`.
- Exact repacks preserve decoded geometry, materials and pixels. Only verified lossless PNG
  rewrites and supported level packing are allowed by that recipe.
- The runtime reads adopted asset manifests. The generated `runtime-index.json` is candidate
  metadata and does not activate an unreviewed candidate.

Structural and byte checks do not prove visual quality or an FPS budget. Validate the rendered
result and measure on the target devices before adopting a delivery change. The focused tests
are `tests/asset-optimization.test.mjs` and `tests/runtime-adoption.test.mjs`; tests that require
unavailable production inputs skip explicitly.
