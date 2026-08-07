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

Movement continues until blocked. The hunter remains dormant until the player starts moving, then follows from the entrance after a short delay.

Extra-life targets prefer routes that increase their distance from the player. At a dead end or local maximum, they commit to a route toward a less-visited region of the maze instead of bouncing between the same cells.

## Reproducible runs

Append a decimal or hexadecimal seed to the URL:

```text
http://localhost:5173/?seed=4271
http://localhost:5173/?seed=DEADBEEF
```

The same run seed and stage number always produce the same maze, coin layout, and spike cycle.

Append `&debug=maze` to highlight escape-loop paths, newly opened passages, and loop coin anchors:

```text
http://localhost:5173/?seed=DEADBEEF&debug=maze
```

## Architecture

- `src/generation/`: seeded randomness, perfect-maze foundations, controlled escape loops, final endpoints, coin placement, and fair spike placement
- `src/game/`: framework-independent movement, scoring, hunter pursuit, timed hazards, collision, and seed parsing
- `src/scenes/`: Phaser input and rendering adapter
- `src/presentation/`: generated original pixel textures

The deterministic game modules do not depend on Phaser. Rendering runs at the browser frame rate while game state advances in fixed `1/120` second steps.

## Current slice

Implemented: sparsely braided generated stages, loop-biased coin clusters, continuous buffered movement, optional coins, stage progression, one delayed hunter with stable route choices, scarce evasive extra-life targets, telegraphed timed floor spikes, retained-life respawns, responsive pixel presentation, and reproducible/debug URLs.

Next: the ambusher and wanderer, moving blades, pause treatment, controller input, reactive audio, and local leaderboards.