# Flag Catch

A fast, colorful 3D capture the flag game for TrueAIGaming.com. Phone first, landscape.

Two teams of animals race around a small island, grab flags and carry them home.
Firecrackers pop rivals loose so they drop what they carry. Land, water and air
animals each rule different ground.

## Status

Phase 1, the feel prototype. One island, two teams of four, flags, bases,
firecrackers, and three animals (Rally Lion, Surf Penguin, Sky Eagle) to compare
movement on land, water and in the air. It is throwaway: it settles movement,
camera, thumb controls and throw feel before the real build.

## Run it

```sh
npm install
npm run dev      # http://localhost:5181
npm test         # headless sim tests
npm run build
```

URL options: `?animal=lion|penguin|eagle`, `?per=1..16` (animals per team),
`?time=20..900` (match seconds), `?seed=N`.

## Controls

- Phone: drag anywhere on the left half to steer. Jump (hold to float, the eagle
  climbs) and Throw on the right.
- Keyboard: WASD or arrows, Space jumps, J throws.

## Layout

- `src/sim.ts`: the match, stepped at a fixed 60 Hz from a seed, no Three.js.
- `src/terrain.ts`: the island height field shared by sim, render and tests.
- `src/animals.ts`: per animal speeds by medium.
- `src/main.ts`, `src/world.ts`, `src/models.ts`, `src/fx.ts`: rendering.
- `src/hud.ts`, `src/input.ts`, `src/audio.ts`: thumbs, HUD and sound.
