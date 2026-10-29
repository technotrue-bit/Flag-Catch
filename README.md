# Flag Catch

A fast, colorful 3D capture the flag game for TrueAIGaming.com. Phone first, landscape.

Two teams of animals race across three lands (your homeland, the middle land and
the enemy's homeland). Each team's flags start in its own base: steal one from
the enemy base and carry it home to score, and guard your own. Firecrackers pop
rivals loose so they drop what they carry; touch your own dropped flag to send
it home.

Three modes, picked on the start screen:

- Capture: one big flag a side, in the team's color with its shape (sun or
  moon), standing in the middle of its base. Steal theirs and bring it home to
  score; it then goes back to their base. Most steals before the clock runs
  out (3 to 6 minutes, by map) wins.
- Hoard: every flag sitting in your base earns a point a second, and the first
  team to 1000 points wins. Stealing flags shifts who earns faster.
- Playful: one flag a side. Bank it to score, and it goes straight back to its
  owners' base for the next round of chasing.

Every flag wears its own team's color wherever it goes. A carried flag rides
on the carrier's back and flutters as they run, and a pin in the team's color
floats over each big flag (and over any Hoard flag on the move), drawn over
hills and trees so you can always see where it is. The minimap shows the same
pins.

Land, water and air animals each rule different ground.

## Rival and teammate animals

Every CPU animal plays like a real player with a job that suits it, shown on
its pick tile:

- Raiders (Dash Panther, Surf Penguin, Jet Shark, Glide Fish, Night Bat)
  steal flags and run them home, fanning out to come at a base from the
  left, the middle and the right.
- Hunters (Turbo Wolf, Moto Bird, Pogo Frog) run down thieves, cutting them
  off on their way home instead of trailing behind.
- Guardians (Skate Mammoth, Ski Croc) walk a patrol ring round their base
  and bodyguard their own carriers.
- The Sky Eagle bombs the guards off a flag from above; every flyer with a
  bomb loaded will, and CPU flyers save it for a crowd or a thief and spray
  confetti at whoever lines up ahead, easing off before the gun overheats
  (Easy ones hold on until it does).
- All rounders (Rally Lion, Bowl Goldfish) fill whatever the team is short of.

Every second or so each team shares out the jobs: two or three hunters per
thief, someone to touch a dropped flag home, bodyguards for each carrier,
guards while the base still has a flag, and raiders for the rest. A team
that's behind late sends more forward; one that's ahead pulls back to guard.
Both teams plan by the same rules, so only skill (Easy, Medium, Hard) tells
them apart.

In Capture and Playful a tie when the clock runs out goes to overtime (up to
two minutes), and the next catch wins.

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

Played on TrueAIGaming.com while signed in, progress also follows your account
to any device (`src/cloud.ts`). The play page sends the account's copy, the game
merges it into its own and sends the result back after every payout; the game
never sees the sign-in. Each device keeps its own running tally inside the save,
so two phones that both played since the last sync add up instead of one
overwriting the other. Played on its own or signed out, nothing leaves the phone.

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
- No spoken voices. The big moments (grabs, scores, saves, knockouts, power
  ups, the last 30 and 10 seconds, the result, a new best or unlock) each ring
  a short bell chime in F major, the key of the music. Nearby animals react
  with a soft tone on their own note: up when happy, a little run when they
  score, down when sad. Busy moments keep only the most important chime, and
  small chimes don't repeat within four seconds.
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

## Graphics

Pick Low, Normal or High under Settings, View. The island rebuilds at once.

- Low: drawn at 1x with fewer sparks, trees, flowers and rocks, for older phones.
- Normal: the classic look, as sharp as the screen allows up to 2x.
- High: soft sun shadows under every tree, animal and base; a glow on the
  brightest things (the sun, lava, embers); reflective water that ripples and
  mirrors the sky, with the sun glinting off it; lava with slowly flowing veins;
  a sky dome with a sun; tufts of grass that sway in the breeze on the green
  worlds; rounder trees, more scenery, patchy lawns and beaches; a soft color
  grade and vignette; and a sharper picture (up to 2.5x).

On every level the frame rate safety net still draws less sharp if the phone
can't keep 60.

Trees, and the posts and banner over each base, turn see-through while they
stand between the camera and your animal, so you never lose sight of yourself.
On High their shadows stay on the ground.

## DS mode

An optional layout for playing with the phone held upright, like a two screen
handheld. The 3D game plays on the top screen; the bottom screen holds an
upright map (the enemy's land at the top, yours at the bottom) with a steering
area on the left and Jump, Throw, Item and Dive on the right (swapped for left
handed play). A hinge with two little lights sits between them.

- Turn it on or off with the DS MODE chip on the title screen, the DS mode
  row in Settings, or the "Play upright in DS mode" button on the turn your
  phone card. The choice is saved on the phone.
- It only splits the screen while the phone is upright. Turn the phone
  sideways and the normal wide layout comes back; turn it upright again for
  the two screens. With DS mode off, an upright phone still asks to be turned.
- Full screen phones only lock to landscape with DS mode off.
- Only the bottom screen steers, so a thumb never covers the game view.

## Menus and settings

- The title screen has Play, How to Play, Settings, DS Mode and Full Screen.
- The pick screen has Menu (back to the title) and Settings in its corner.
- In a match, the pause button (top left) opens Resume, Settings, How to Play,
  Restart and Quit to menu. Leaving the app pauses the match too.
- Settings, saved on the phone: Music and Sounds volume (Sounds covers the
  chimes); Chimes on or off; Graphics (Low, Normal, High); Zoom; Camera turn (slow, normal, fast);
  Screen shake; Calm effects (fewer sparks, no lightning flash, a softer
  glow); Left handed (steer on the right, buttons on the left); Big buttons;
  Vibration where the phone has it; DS mode. `?dev` adds the feel tuning sliders.
- Your last animal, world, mode, team size, role and rival level are kept
  for next time.

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

Flyers (Sky Eagle, Glide Fish, Night Bat) fly on their own, low over land and
water alike: the stick steers and sets the speed, from a slow cruise with it let
go to full speed pushed all the way. They carry two weapons instead of
firecrackers. BOMB (the Jump button, or Space) drops a bomb that pops everyone
within 6 m, twice as hard within 2.5 m, and takes 30 seconds to load again.
FIRE (the Throw button, or J held) sprays a confetti machine gun, seven shots a
second; five confetti hits make one hit. Holding it heats the gun, and after 7
seconds of fire it overheats and cools for 3 seconds. The buttons show the
bomb's reload and the gun's heat. Flying low, flyers still grab flags and items
and can still be hit.

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
cue chimes in place of voices, and a juice pass. Phase 6 brought eight
worlds, points and unlocks, and Playful mode, on top of power ups and team
sizes from 8v8 to 64v64. Thirteen animals to pick from:

- Land: Rally Lion, Moto Bird (sharp turns, big hops), Skate Mammoth (heavy,
  shrugs off pops fast), Turbo Wolf (a fast four wheeled car with a launcher)
  and Dash Panther (a kick scooter with razor sharp turns).
- Water: Surf Penguin, Ski Croc, Jet Shark (fastest in water, slow on land),
  Bowl Goldfish (rolls in a fishbowl, as good on land as in water) and Pogo
  Frog (giant pogo jumps). The divers hold Dive in water to slip under
  firecrackers until their breath runs out.
- Air: Sky Eagle (the bomber), Glide Fish (turns well) and Night Bat (fastest
  flyer, fragile). They fly on their own, with a bomb and a confetti gun.

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
  there; slide within its ring to steer. Jump (hold to float), Throw and Item
  on the right; flyers get BOMB and FIRE (hold) in place of Jump and Throw. Swimmers get a Dive button in water; its
  ring drains with their breath.
- Keyboard: WASD or arrows, Space jumps (flyers: bomb), J throws (flyers: hold to fire), E uses your item, R plants a respawn flag as a medic, Shift or L dives.
- Pinch and double tap never zoom the page. Zoom the camera from Settings.

## Layout

- `src/sim.ts`: the match, stepped at a fixed 60 Hz from a seed, no Three.js.
- `src/terrain.ts`: the maps and their three land height field, shared by sim, render and tests.
- `src/worlds.ts`: the eight worlds' shapes, colors, trees and twists.
- `src/progress.ts`: points, unlocks and best scores, with per-device tallies and the merge. `src/cloud.ts`: account saves through the TrueAIGaming play page.
- `src/animals.ts`: per animal speeds by medium and shot stats.
- `src/critters.ts`: the animal models and their rigs.
- `src/main.ts`, `src/world.ts`, `src/models.ts`, `src/fx.ts`: rendering. `src/look.ts`: the Graphics levels, shadows and the High passes.
- `src/hud.ts`, `src/input.ts`, `src/audio.ts`: menus, thumbs, HUD, sound, chimes and animal mood tones.
- `src/cues.ts`: the cue chimes for big moments. `src/settings.ts`: saved player settings.
