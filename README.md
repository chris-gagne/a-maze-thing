# A-Maze-Thing

An endless, score-driven 2D arcade game built with Phaser, TypeScript, and Vite. Each stage is a seeded, sparsely braided maze: collect coins, use alternate routes to misdirect the hunter, and reach the exit.

## Run locally

```powershell
npm install
npm run dev
```

Create a production build with `npm run build` and run the deterministic test suite with `npm test`.

## Controls

- On the first run or a New Run, `Up` / `Down` or `W` / `S`: choose difficulty
- On the difficulty selector, `Enter`, `Space`, click, or tap: start the selected mode
- Arrow keys or `WASD`: queue a direction at the next legal junction
- `Escape`: pause or return to the game during active gameplay
- While paused, `T`: retry the current level from its starting state
- While paused, `R`: retry the same seed from Stage 1
- While paused, `Enter`: start a new run with a fresh seed
- `Enter`, `Space`, click, or tap: dismiss a stage briefing
- On game over, `Enter`: start a new run with a fresh seed
- On game over, `R`: retry the same seed from Stage 1

Movement continues until blocked. The hunter remains dormant until the player starts moving, then follows from the entrance after a short delay.

## Difficulty

- `CASUAL MODE`: All maze, no menace. The walls are the only thing judging you. No coins, baddies, traps, Extra Life, or portals.
- `EASY PEASY`: Full systems, half speed. Danger has been asked to walk.
- `NORMAL`: Factory settings. The maze cheats only the approved amount.
- `OVERCLOCKED`: Everything at 150%. Warranty status: extremely void.

The first run and every `NEW RUN` open the difficulty selector with Normal preselected. Press Enter for the default or deliberately choose another signal. `RETRY LEVEL` and `RETRY SEED` preserve the active difficulty. Easy Peasy and Overclocked scale gameplay movement, enemy release, and hazard timing together; menus and transitions remain at normal speed. Casual Mode keeps only the generated maze, Start, Exit, and player, replacing score and lives with a mode indicator.

Escape opens a pause menu during active gameplay. While paused, simulation time, movement, hazards, and gameplay animations freeze. `RETURN TO GAME` preserves the exact stage state. `RETRY LEVEL` rebuilds the current level with the same layout, score carried from earlier levels, and lives held when the level began; progress and life changes from the discarded attempt are reset, and dismissed feature briefings do not repeat. `RETRY SEED` starts a clean Stage 1 run with the same seed and difficulty, while `NEW RUN` opens the difficulty selector for a fresh seed. Both run-level actions reset score, lives, stage progress, and feature discoveries. Pause is unavailable during briefings, life-loss interruptions, stage transitions, and game over.

Coins are optional, but collecting every coin before reaching the exit earns the `COIN MONGER!` bonus and doubles that stage's coin award. The multiplier applies only when the stage is completed, never doubles score carried from earlier stages, and remains available after losing a reserve life because collected coins stay collected. A game over before the exit receives no bonus. Score saving remains deferred.

A fresh run opens with a short maze briefing. Later stages pause for one combined introduction only when their generated layout contains something not yet seen in that run, such as spikes or the evasive Extra Life. The maze simulation and hazard timers remain frozen until the briefing is dismissed; game over resets these discoveries for the next run.

Floor spikes damage the player only while active. They never damage hostile enemies, but active spikes block new hunter, Ambusher, and Wanderer routes; inactive, warning, and recovery phases remain traversable.

Beginning on Stage 11, eligible full-game mazes hide one Ambusher at the end of a deep, single-entry branch outside Start's five-tile reveal radius. It remains invisible until the player reaches a tile within five walkable steps. The player finishes entering that tile, stops, and receives a one-second warning before the revealed Ambusher begins pursuing at hunter speed. After a reserve-life loss it returns to its hiding cell but remains visible and active. Expose the Ambusher and still reach the exit to earn the flat `SURVIVE THE AMBUSH +25` bonus; Coin Monger is calculated first and does not double this award. Stages without a qualifying five-tile branch contain no Ambusher, and Casual Mode remains maze-only.

Beginning on Stage 21, a Wanderer enters every full-game maze at the Exit after a seeded delay of 5 to 60 simulation seconds. A one-second alert freezes play, then it wanders at 1.5 cells per Normal-mode second, choosing seeded random routes biased toward Start and avoiding active spikes. Reaching Start lets it leave. Coming within five walkable tiles permanently triggers hunter-speed pursuit; the player stops on the triggering tile for a one-second warning. An arrival already within range combines both warnings into one pause. Its exact position and mode survive a reserve-life loss. Escaping after it has spawned but before it leaves earns `EVADING THE WANDERER +25`, independently of Coin Monger and the Ambusher bonus; escaping before arrival earns nothing. Difficulty scales its schedule and movement in real time, and Casual Mode excludes it.

Extra-life targets move more slowly than the hunter but prefer routes that increase their distance from the player. At a dead end or local maximum, they commit to a route toward a less-visited region of the maze instead of bouncing between the same cells.

Each run starts with one life and can hold at most two. The evasive Extra Life is guaranteed on Stage 2 while one life remains; later replacement opportunities are scarce and random. Catching it grants the single reserve life. Losing that reserve resets the player and hunter, clears the Start return link, and pauses for 1.25 seconds with a cause-specific message. The Wanderer remains exactly where it was, including whether it was wandering or pursuing. Collected coins, caught targets, and the current hazard clock are preserved.

Losing the final life opens a persistent run summary with the highest stage reached and total coins recovered. `NEW RUN` generates a pending fresh seed and opens the difficulty selector; the URL updates when a mode is confirmed. `RETRY SEED` restarts Stage 1 with the same generated stage sequence and difficulty. Both reset lives, score, and feature discoveries. Scores are carried only during the active run; saving, history, and leaderboards are deferred.

Some distant dead ends contain reusable portals. Entering one returns the player to the maze entrance while the hunter, collected coins, hazards, and other stage state continue unchanged. After leaving the entrance, a pulsing amber portal dot appears inside the red Start box; returning to Start then sends the player back to the last portal used. A newer portal replaces that return destination, and losing a life clears both the link and dot. Portals affect the player only.

## Maze progression

Maze size and route complexity now grow across five ten-stage bands:

- Stages 1-10: small to medium, from `11x7` to `17x13`
- Stages 11-20: medium to large, ending at `23x19`
- Stages 21-30: large to extra large, ending at `29x25`
- Stages 31-40: extra large to XXL, ending at `35x31`
- Stages 41-50: XXL to XXXL, ending at the initial `41x37` cap

Later bands add more junctions, interacting loops, and long loop-backs while retaining useful dead ends. Mazes larger than the play area keep the 48-pixel cell scale and use a player-following camera; the HUD remains fixed and there is no minimap. The Stage 50 cap is an initial calibration target for a three-to-four-minute first blind clear in Casual Mode and may be tuned from playtest results.

Stage 51 and later remain at the size cap and rotate deterministic maze variations: compact interconnected loops, longer loop-backs, and qualified alternate boundary endpoints. Full-game modes also rotate between three, four, and five spikes; Casual Mode remains maze-only. Existing seed URLs remain deterministic but produce layouts from this revised generator rather than preserving layouts from earlier builds.

## Reproducible runs

Append a decimal or hexadecimal seed and canonical difficulty to the URL to launch a complete run directly:

```text
http://localhost:5173/?seed=4271&difficulty=normal
http://localhost:5173/?seed=DEADBEEF&difficulty=overclocked
```

The same run seed, difficulty, stage number, and retained-life state reproduce the same run. Maze geometry is identical across difficulties; mode controls which gameplay systems are present and how quickly simulation time advances. Retained lives matter because Extra Life targets appear only when the player has at most one life, and occupied cells are excluded from coin and spike placement.

Append `&debug=maze` to highlight escape-loop paths, newly opened passages, and loop coin anchors:

```text
http://localhost:5173/?seed=DEADBEEF&debug=maze
```

While maze debugging is enabled, append a positive stage number to inspect a progression or post-cap profile directly:

```text
http://localhost:5173/?seed=DEADBEEF&difficulty=casual&debug=maze&stage=50
```

The `stage` override is ignored unless `debug=maze` is also present.
Maze debug mode always runs with Easy Peasy timing and skips the difficulty selector, regardless of any `difficulty` value in the URL.

## Architecture

- `src/generation/`: seeded randomness, perfect-maze foundations, controlled escape loops, final endpoints, dead-end portals, coin placement, and fair spike placement
- `src/game/`: framework-independent movement, scoring, blocker-aware enemy navigation, hunter pursuit, timed hazards, collision, and seed parsing
- `src/scenes/`: Phaser input and rendering adapter
- `src/presentation/`: generated original pixel textures

The deterministic game modules do not depend on Phaser. Rendering runs at the browser frame rate while game state advances in fixed `1/120` second steps.

## Current slice

Implemented: four run difficulties, maze-only Casual Mode, scalable gameplay timing, five-band maze growth through Stage 50, increasingly braided route profiles, scrolling late-stage worlds, deterministic post-cap variations, reusable dead-end escape portals, loop-biased coin clusters, continuous buffered movement, optional coins, stage progression, run-scoped feature briefings, one delayed hunter with stable route choices, hidden Stage 11+ Ambushers with a 25-coin survival challenge, seeded Stage 21+ Wanderers with evasion rewards, scarce evasive extra-life targets, telegraphed timed floor spikes, retained-life respawns, a responsive sprite legend, pixel presentation, and reproducible/debug URLs.

Next: moving blades, controller input, reactive audio, and local leaderboards.