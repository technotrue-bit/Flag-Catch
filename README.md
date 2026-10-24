# Flag Catch

A fast, colorful 3D capture the flag game for TrueAIGaming.com. Phone first, landscape.

Two teams of animals race across three lands (your homeland, the middle land and
the enemy's homeland). Each team's flags start in its own base: steal one from
the enemy base and carry it home to score, and guard your own. Firecrackers pop
rivals loose so they drop what they carry; touch your own dropped flag to send
it home.

Two modes, picked on the start screen:

- Capture: most steals before the clock runs out (3 to 6 minutes, by map).
- Hoard: every flag sitting in your base earns a point a second, and the first
  team to 1000 points wins. Stealing flags shifts who earns faster.

Land, water and air animals each rule different ground.

## Team sizes and maps

Pick 8, 16, 32 or 64 animals a side on the start screen. Each size gets its own
island, drawn from the same three land layout:

- 8v8: Home Isle, two bridges per channel, 5 flags a team.
- 16v16: Wide Isle, wider, three bridges, 7 flags a team.
- 32v32: Gigantic Isle, four bridges, side lakes, ponds and extra hills, 10 flags a team.
- 64v64: Colossal Isle, five bridges, 14 flags a team.

The two gigantic maps give each team two outpost bases on the flanks of its
homeland as well as the main base. Flags start spread across all three, and a
carrier banks at whichever of its team's bases is nearest.

## Health, knockouts and medics

Every animal takes 3 hits. The first two make it flinch and stagger, and one
heals back after 6 seconds without being hit. The third knocks it out: it
drops any flag, is off the field for 2 seconds, and comes back with full health
and a short shield at whichever of its team's bases or respawn flags is
closest to where it fell. Blast counts as two hits.

Pick MEDIC as your role on the start screen to get a FLAG button (or R): it
plants a respawn flag where you stand, once every 30 seconds, anywhere but on
the enemy's bases. Each medic keeps two up at a time, and an enemy who drives
into one knocks it down. One in eight CPU animals is a medic.

Flyers fly for as long as Jump is held, up to a ceiling, and glide down slowly
when it's let go.

## CPU brains and difficulty

Every CPU weighs its options a few times a second, the way a player would:
carry a flag home, chase a thief, save or grab a dropped flag, steal from the
base fewest enemies guard, fight anyone close (a hurt one first), detour for a
power up, back off to heal at its last hit, escort a teammate, follow the
front as a medic, or knock down an enemy respawn flag. It reads the score and
the clock: a team trailing late pushes forward, one leading late holds. Between
decisions it dodges shots it sees coming (hopping skidding ones), aims where a
moving target is going, and carriers steer around enemies.

Pick the rivals' level on the start screen. Your teammates always play Medium.

- Easy: slow to react, loose choices, rarely dodges, aims where you are, and
  everyone chases the same target.
- Medium: a fair fight.
- Hard: quick, reads the game, dodges most shots, aims ahead and spreads out.

With dozens of CPUs a side, small edges add up, so on bigger teams Easy and
Hard sit closer to Medium. That keeps each level about as winnable at 64v64
as at 8v8. `?difficulty=easy|medium|hard` presets it.

## Power ups

Gift box stations dot every map (more on the gigantic ones). Drive through one
with empty hands to get a random item, then tap ITEM (or E) to use it:

- Shield: blocks every hit for 7 seconds.
- Star: 7 seconds untouchable and faster, and any enemy you bump pops.
- Triple: three firecrackers in a fan.
- Missile: a paper dart that homes in on the nearest enemy ahead.
- Super Jump: a huge leap.
- Lightning: pops every enemy close around you.
- Blast: a shockwave that pops and throws back enemies right next to you.
- Turbo: a 5 second burst of speed.

A station's box comes back 8 seconds after it is taken.

## Status

Phase 4, power ups, plus team sizes from 8v8 to 64v64. Seven animals to pick from:

- Land: Rally Lion, Moto Bird (sharp turns, big hops), Skate Mammoth (heavy,
  shrugs off pops fast) and Turbo Wolf (a fast four wheeled car with a launcher).
- Water: Surf Penguin and Ski Croc. Both hold Dive in water to slip under
  firecrackers until their breath runs out.
- Air: Sky Eagle. Hold Jump to fly; Throw while high up drops a bomb that pops
  every enemy nearby.

A match opens on the pick screen, counts down 3, 2, 1, GO!, and ends on a results
card. Online play comes next.

## Run it

```sh
npm install
npm run dev      # http://localhost:5181
npm test         # headless sim tests
npm run build
```

URL options: `?animal=lion|penguin|croc|bird|eagle|mammoth|wolf` (preselected on the pick screen), `?per=1..64` (animals per team; small numbers are for testing),
`?time=20..900` (Capture match seconds, overrides the map's), `?mode=hoard`, `?seed=N`.

## Controls

- Phone: put your thumb down anywhere on the left half and the stick stays
  there; slide within its ring to steer. Jump (hold to float, the eagle
  climbs), Throw and Item on the right. Swimmers get a Dive button in water; its
  ring drains with their breath.
- Keyboard: WASD or arrows, Space jumps (hold to fly), J throws, E uses your item, R plants a respawn flag as a medic, Shift or L dives.
- Pinch and double tap never zoom the page. Zoom the camera from SETTINGS
  (top left), which also holds the feel tuning sliders and pauses the match.

## Layout

- `src/sim.ts`: the match, stepped at a fixed 60 Hz from a seed, no Three.js.
- `src/terrain.ts`: the maps and their three land height field, shared by sim, render and tests.
- `src/animals.ts`: per animal speeds by medium and shot stats.
- `src/main.ts`, `src/world.ts`, `src/models.ts`, `src/fx.ts`: rendering.
- `src/hud.ts`, `src/input.ts`, `src/audio.ts`: thumbs, HUD and sound.
