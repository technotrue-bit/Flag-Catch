# Flag Catch

A fast, colorful 3D capture the flag game for TrueAIGaming.com. Phone first, landscape.

Two teams of animals race across three lands (your homeland, the middle land and
the enemy's homeland). Each team's flags start in its own base: steal one from
the enemy base and carry it home to score, and guard your own. Firecrackers pop
rivals loose so they drop what they carry; touch your own dropped flag to send
it home.

Three modes, picked on the start screen:

- Capture: most steals before the clock runs out (3 to 6 minutes, by map).
- Hoard: every flag sitting in your base earns a point a second, and the first
  team to 1000 points wins. Stealing flags shifts who earns faster.
- Playful: one flag a side. Bank it to score, and it goes straight back to its
  owners' base for the next round of chasing.

Land, water and air animals each rule different ground.

## Worlds

Eight worlds, picked with the arrows on the start screen. Each one reshapes
and repaints the same three land layout and adds a twist of its own. Every
world is the same for both teams (the ground matches when turned round the
middle), and bases, flags, stations and bridge landings always stay dry and level.

- Home Isle: gentle grass and beaches.
- Ring Reef: broken rings of reef water cut the lands (with gaps to drive
  through), palms, coral in the shallows. Swimmers rule.
- Bumpy Bluffs: rolling bumps to launch off and two lookout bluffs, in autumn colors.
- Frost Floe: ice. Land animals slide and drift when they turn; the penguin
  grips best and the mammoth's skateboard holds well. Pines, ice floes and snow.
- Deep Lagoon: mostly sea, with small islands round the bases and stations.
- Storm Spire: a rock spire in the middle, wind that swings round the compass
  every 40 seconds (it shoves flyers most), and lightning that lands near each
  team in turn after a glowing warning ring. Rain.
- Rust Dunes: red dunes and flat topped mesas, cacti and blowing dust.
- Lava Loop: the channels and sea are lava. Touching it costs a hit and throws
  you back toward the nearest land, so there is no swimming across; the
  bridges are narrow and everyone but flyers uses them. Embers drift up.

## Points and unlocks

Every match pays your own points plus 100 for a win (40 for a draw). Points add
up on your phone and open new animals, worlds and Playful mode along the way;
the start screen shows your total and what opens next, and each world shows
your best match there. New players start with the Rally Lion, the Turbo Wolf
and Home Isle. Players from before unlocks keep the first seven animals.
`?unlock=all` opens everything for testing.

## Look, sound and feel

- The animals are round, soft toy figures with big eyes and a thin ink outline,
  each on its own ride. They lean into turns and against speeding up, bounce
  along, squash when they land, look about and breathe when still, and twirl
  for joy after banking a flag. The frog bounces on its pogo stick.
- Animals are drawn part way between sim steps, so motion stays smooth on 60
  and 120 Hz screens. Shading is soft, with a sky fill and a gentle sun.
- The sea shades from pale foam at the shore to deep blue water, with
  clouds drifting overhead, flower patches on the grass and rocks on the beaches.
- Wheels kick up dust on land and leave a white wake on the water. The view
  widens a little at speed and more on Turbo.
- Score pills pop when a team scores, and the last ten seconds tick out loud.
- An original looping island tune plays: calm on the menus, with drums in a
  match, then faster and busier for the last 30 seconds (or near 1,000 in
  Hoard).
- A cheery announcer (quiet during the countdown) calls the big moments (grabs, scores, knockouts, the
  last 30 and 10 seconds, the result) in the phone's own voice, and the
  animals chatter in made up syllables, each at its own pitch: happy when they
  grab, a cheer when they score, a yelp when hit. Busy moments keep only the
  most important call, and small calls don't repeat within six seconds.
- Big moments glow round the screen edges (gold for your score, red when
  you're hit), your points float up over your head, the view kicks wider when
  you score, stunned animals get circling stars, hard landings puff dust, and
  carried flags leave a sparkle trail. Phones that allow it buzz a little.
- The results card counts its numbers up, shows the match MVP and fills a bar
  toward your next unlock. A win throws confetti and your animal twirls.
- Add it to your home screen (Share, then Add to Home Screen on iPhone) to
  play full screen with its own icon. The title screen's Full Screen button
  does it in one tap on Android and computers, and shows the steps on iPhone,
  where Safari doesn't let web pages hide its bars.

## Menus and settings

- The title screen has Play, How to Play, Settings and Full Screen.
- The pick screen has Menu (back to the title) and Settings in its corner.
- In a match, the pause button (top left) opens Resume, Settings, How to Play,
  Restart and Quit to menu. Leaving the app pauses the match too.
- Settings, saved on the phone: Music and Sounds volume; Voices (announcer
  and animals, animals only, or off); Zoom; Camera turn (slow, normal, fast);
  Screen shake; Calm effects (fewer sparks, no lightning flash, a softer
  glow); Left handed (steer on the right, buttons on the left); Big buttons;
  Vibration where the phone has it. `?dev` adds the feel tuning sliders.

## Telling teams apart

Your team is blue and the rivals are red. Every animal stands on a ring in its
team's color, and the team color is painted on its ride too. Your own animal
glows, has a pulsing gold halo round its ring, and a gold arrow bobs over its
head that shows through hills and trees, so you never lose yourself in a crowd.
On the minimap you are the gold edged dot, and a rival carrying one of your
flags is a bigger red dot with a white edge.

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

Phase 7: a title screen, pause menu, settings for sound, view and controls,
an announcer and animal chatter, and a juice pass. Phase 6 brought eight
worlds, points and unlocks, and Playful mode, on top of power ups and team
sizes from 8v8 to 64v64. Thirteen animals to pick from:

- Land: Rally Lion, Moto Bird (sharp turns, big hops), Skate Mammoth (heavy,
  shrugs off pops fast), Turbo Wolf (a fast four wheeled car with a launcher)
  and Dash Panther (a kick scooter with razor sharp turns).
- Water: Surf Penguin, Ski Croc, Jet Shark (fastest in water, slow on land),
  Bowl Goldfish (rolls in a fishbowl, as good on land as in water) and Pogo
  Frog (giant pogo jumps). The divers hold Dive in water to slip under
  firecrackers until their breath runs out.
- Air: Sky Eagle (Throw while high up drops a bomb), Glide Fish (swims, dives
  and flies) and Night Bat (fastest flyer, quick throws, fragile). Hold Jump to fly.

CPU animals are mirrored slot by slot across the teams, and the rival in your
slot rides your animal, so neither side starts with the better line up.

The game opens on the title screen, then the pick screen; a match counts down
3, 2, 1, GO!, and ends on a results card. Next is launch on TrueAIGaming.com,
then online play.

## Run it

```sh
npm install
npm run dev      # http://localhost:5181
npm test         # headless sim tests
npm run build
```

URL options: `?animal=<id>` (lion, penguin, croc, bird, eagle, mammoth, wolf, shark, goldfish, panther, flyfish, bat, frog), `?world=<id>` (home, reef, bluffs, frost, lagoon, storm, dunes, lava), `?per=1..64` (animals per team; small numbers are for testing),
`?time=20..900` (Capture match seconds, overrides the map's), `?mode=hoard|playful`, `?unlock=all`, `?seed=N`.
Test games with `?per` or `?time` don't pay points.

## Controls

- Phone: put your thumb down anywhere on the left half and the stick stays
  there; slide within its ring to steer. Jump (hold to float, the eagle
  climbs), Throw and Item on the right. Swimmers get a Dive button in water; its
  ring drains with their breath.
- Keyboard: WASD or arrows, Space jumps (hold to fly), J throws, E uses your item, R plants a respawn flag as a medic, Shift or L dives.
- Pinch and double tap never zoom the page. Zoom the camera from Settings.

## Layout

- `src/sim.ts`: the match, stepped at a fixed 60 Hz from a seed, no Three.js.
- `src/terrain.ts`: the maps and their three land height field, shared by sim, render and tests.
- `src/worlds.ts`: the eight worlds' shapes, colors, trees and twists.
- `src/progress.ts`: points, unlocks and best scores.
- `src/animals.ts`: per animal speeds by medium and shot stats.
- `src/critters.ts`: the animal models and their rigs.
- `src/main.ts`, `src/world.ts`, `src/models.ts`, `src/fx.ts`: rendering.
- `src/hud.ts`, `src/input.ts`, `src/audio.ts`: menus, thumbs, HUD, sound and animal chatter.
- `src/voice.ts`: the announcer. `src/settings.ts`: saved player settings.
