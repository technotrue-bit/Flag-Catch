# Flag Catch

A fast, colorful 3D capture the flag game for TrueAIGaming.com. Phone first, landscape.

Two teams of animals race across three lands (your homeland, the middle land and
the enemy's homeland). Each team's flags start in its own base: steal one from
the enemy base and carry it home to score, and guard your own. Firecrackers pop
rivals loose so they drop what they carry; touch your own dropped flag to send
it home.

Two modes, picked on the start screen:

- Capture: most flags brought home before the 3 minute clock runs out.
- Hoard: every flag sitting in your base earns a point a second, and the first
  team to 1000 points wins. Stealing flags shifts who earns faster. Land, water and air
animals each rule different ground.

## Status

Phase 1, the feel prototype. Three lands joined by bridges over water channels,
two teams of four, flags, bases, firecrackers, and four animals to pick from:
Rally Lion, Surf Penguin, Sky Eagle and Turbo Wolf (a fast four wheeled car with
a launcher). A match opens on the pick screen, counts down 3, 2, 1, GO!, and ends
on a results card. It is throwaway: it settles movement, camera, thumb controls
and throw feel before the real build.

## Run it

```sh
npm install
npm run dev      # http://localhost:5181
npm test         # headless sim tests
npm run build
```

URL options: `?animal=lion|penguin|eagle|wolf` (preselected on the pick screen), `?per=1..16` (animals per team),
`?time=20..900` (Capture match seconds), `?mode=hoard`, `?seed=N`.

## Controls

- Phone: put your thumb down anywhere on the left half and the stick stays
  there; slide within its ring to steer. Jump (hold to float, the eagle
  climbs) and Throw on the right.
- Keyboard: WASD or arrows, Space jumps, J throws.
- Pinch and double tap never zoom the page. Zoom the camera from SETTINGS
  (top left), which also holds the feel tuning sliders and pauses the match.

## Layout

- `src/sim.ts`: the match, stepped at a fixed 60 Hz from a seed, no Three.js.
- `src/terrain.ts`: the three land height field shared by sim, render and tests.
- `src/animals.ts`: per animal speeds by medium and shot stats.
- `src/main.ts`, `src/world.ts`, `src/models.ts`, `src/fx.ts`: rendering.
- `src/hud.ts`, `src/input.ts`, `src/audio.ts`: thumbs, HUD and sound.
