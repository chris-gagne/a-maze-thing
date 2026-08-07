# A-Maze-Thing

An endless, score-driven 2D arcade game built with Phaser, TypeScript, and Vite. Each stage is a seeded, sparsely braided maze: collect coins, use alternate routes to misdirect the hunter, and reach the exit.

## Run locally

```powershell
npm install
npm run dev
```

Create a production build with `npm run build` and run the deterministic test suite with `npm test`.

## Controls

- Arrow keys or `WASD`: queue a direction at the next legal junction
- `Enter`, `Space`, click, or tap: dismiss a stage briefing
- On game over, `Enter`: start a new run with a fresh seed
- On game over, `R`: retry the same seed from Stage 1

Movement continues until blocked. The hunter remains dormant until the player starts moving, then follows from the entrance after a short delay.

A fresh run opens with a short maze briefing. Later stages pause for one combined introduction only when their generated layout contains something not yet seen in that run, such as spikes or the evasive Extra Life. The maze simulation and hazard timers remain frozen until the briefing is dismissed; game over resets these discoveries for the next run.

Floor spikes damage the player only while active. They never damage hostile enemies, but active spikes block new hunter routes; inactive, warning, and recovery phases remain traversable. Future ambusher and wanderer enemies will use the same blocker-aware navigation.

Extra-life targets move more slowly than the hunter but prefer routes that increase their distance from the player. At a dead end or local maximum, they commit to a route toward a less-visited region of the maze instead of bouncing between the same cells.

Each run starts with one life and can hold at most two. The evasive Extra Life is guaranteed on Stage 2 while one life remains; later replacement opportunities are scarce and random. Catching it grants the single reserve life. Losing that reserve resets the player and hunter, clears the Start return link, and pauses for 1.25 seconds with a message identifying whether the hunter or spikes caused the hit. Collected coins, caught targets, and the current hazard clock are preserved.

Losing the final life opens a persistent run summary with the highest stage reached and total coins recovered. `NEW RUN` generates a fresh seed and updates the URL; `RETRY SEED` restarts Stage 1 with the same generated stage sequence. Both reset lives, score, and feature discoveries. Scores are carried only during the active run; saving, history, and leaderboards are deferred.

Some distant dead ends contain reusable portals. Entering one returns the player to the maze entrance while the hunter, collected coins, hazards, and other stage state continue unchanged. After leaving the entrance, a pulsing amber portal dot appears inside the red Start box; returning to Start then sends the player back to the last portal used. A newer portal replaces that return destination, and losing a life clears both the link and dot. Portals affect the player only.

## Reproducible runs

Append a decimal or hexadecimal seed to the URL:

```text
http://localhost:5173/?seed=4271
http://localhost:5173/?seed=DEADBEEF
```

The same run seed, stage number, and retained-life state reproduce the same maze, portals, coin layout, extra-life target, and spike cycle. Retained lives matter because extra-life targets appear only when the player has at most one life, and occupied cells are excluded from coin and spike placement.

Append `&debug=maze` to highlight escape-loop paths, newly opened passages, and loop coin anchors:

```text
http://localhost:5173/?seed=DEADBEEF&debug=maze
```

## Architecture

- `src/generation/`: seeded randomness, perfect-maze foundations, controlled escape loops, final endpoints, dead-end portals, coin placement, and fair spike placement
- `src/game/`: framework-independent movement, scoring, blocker-aware enemy navigation, hunter pursuit, timed hazards, collision, and seed parsing
- `src/scenes/`: Phaser input and rendering adapter
- `src/presentation/`: generated original pixel textures

The deterministic game modules do not depend on Phaser. Rendering runs at the browser frame rate while game state advances in fixed `1/120` second steps.

## Current slice

Implemented: sparsely braided generated stages, reusable dead-end escape portals, loop-biased coin clusters, continuous buffered movement, optional coins, stage progression, run-scoped feature briefings, one delayed hunter with stable route choices, scarce evasive extra-life targets, telegraphed timed floor spikes, retained-life respawns, a responsive sprite legend, pixel presentation, and reproducible/debug URLs.

Next: the ambusher and wanderer, moving blades, pause treatment, controller input, reactive audio, and local leaderboards.