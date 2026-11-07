# Flag Catch

A fast, colorful 3D capture the flag game for TrueAIGaming.com. Phone first, landscape.

Two teams of animals race across three lands (your homeland, the middle land and
the enemy's homeland). Each team's flags start in its own base: steal one from
the enemy base and carry it home to score, and guard your own. Firecrackers pop
rivals loose so they drop what they carry; touch your own dropped flag to send
it home.

Four modes, picked in the match settings:

- Capture: one big flag a side, in the team's color with its shape (sun or
  moon), standing in the middle of its base. Steal theirs and bring it home to
  score; it then goes back to their base. Most steals before the clock runs
  out (3 to 6 minutes, by map) wins.
- Hoard: every flag sitting in your base earns a point a second, and the first
  team to 1000 points wins. Stealing flags shifts who earns faster.
- Playful: one flag a side. Bank it to score, and it goes straight back to its
  owners' base for the next round of chasing.
- Deathmatch (team deathmatch): no flags. Every rival your team knocks out
  is a point, and the team with more when the 10 minute clock runs out wins;
  a tie goes to overtime, where the next knockout wins. The arrow points at
  the nearest rival, and CPUs go looking for fights (finishing off rivals on
  their last hit first). Open from the start, offline and online.

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

Which animal each CPU rides suits the map being played (`src/lineup.ts`). Every
animal gets a fit score for each world: swimmers rule Deep Lagoon and Ring Reef,
can't cross Lava Loop and find no water on Rust Dunes (the Bowl Goldfish and
Pogo Frog still get about on land, so they stay picks there), land animals have
nothing to stand on in Deep Lagoon, Storm Spire's wind keeps flyers rarer, and on
Frost Floe the grippy Surf Penguin and Skate Mammoth come up more. Only animals
allowed on the world play it (see Worlds), the rest are picked by how well they
fit, and each team gets a fair mix of jobs (raiders, hunters, guardians, a
bomber, all rounders) with no one animal filling most of it.

Every second or so each team shares out the jobs: two or three hunters per
thief, someone to touch a dropped flag home, bodyguards for each carrier,
guards while the base still has a flag, and raiders for the rest. A team
that's behind late sends more forward; one that's ahead pulls back to guard.
Both teams plan by the same rules, so only skill (Easy, Medium, Hard) tells
them apart.

In Capture and Playful a tie when the clock runs out goes to overtime (up to
two minutes), and the next catch wins.

## Worlds

Eight worlds (maps), picked with the arrows on the first pick screen. Each one starts
from the same three land layout and adds a twist of its own, and they run from all land
to all sea (each world's `ground` and `fill` in `src/worlds.ts`). Every world is the same
for both teams (the ground matches when turned round the middle), and bases, flags,
stations and bridge landings always stay dry and level.

- Rust Dunes: all land, no water anywhere (and no bridges): red dunes and flat
  topped mesas, cacti and blowing dust.
- Frost Floe: the channels have frozen over, but for a few holes and the water
  under each bridge. Ice: land animals slide and drift when they turn; the
  penguin grips best and the mammoth's skateboard holds well. Pines and snow.
- Bumpy Bluffs: rolling bumps to launch off, two lookout bluffs, and wide land
  necks across both channels on the flanks, in autumn colors.
- Home Isle: the classic three islands, gentle grass and beaches.
- Storm Spire: a rock spire in the middle, wind that swings round the compass
  every 40 seconds (it shoves flyers most), and lightning that lands near each
  team in turn after a glowing warning ring. Rain.
- Lava Loop: the channels and sea are lava. Touching it costs a hit and throws
  you back toward the nearest land, so there is no swimming across; the
  bridges are narrow and everyone but flyers uses them. Embers drift up.
- Ring Reef: broken rings of reef water cut the lands (with gaps to drive
  through), wider lagoons, palms, coral in the shallows. Swimmers rule.
- Deep Lagoon: open sea, with only a sand bar under each base and gift box
  station, and no bridges.

Each world has its own animals, the ones that can get about on it
(`allowedOn` in `src/lineup.ts`); the map picker says who plays:

- Deep Lagoon: swimmers and flyers.
- Rust Dunes and Lava Loop: land animals and flyers, plus the Bowl Goldfish and
  Pogo Frog, which get about on land too.
- Everywhere else: everyone.

Only allowed animals play a world, CPUs and you alike (your rival rides your
animal). On the pick screen the others say NOT ON THIS MAP, and flicking to a
world your animal can't play switches you to the open one that suits it best,
of the same job when there is one. Online, a player's pick that doesn't suit the
host's world swaps the same way. The daily challenge's animal always plays its world.

## Points and unlocks

Every match pays your own points plus 100 for a win (40 for a draw). Points add
up on your phone and open new animals, worlds and Playful mode along the way;
the first pick screen shows your total and what opens next, and each world shows
your best match there. New players start with the Rally Lion, the Turbo Wolf
and Home Isle. Players from before unlocks keep the first seven animals.
`?unlock=all` opens everything for testing.

Played on TrueAIGaming.com while signed in, progress also follows your account
to any device (`src/cloud.ts`). The play page sends the account's copy, the game
merges it into its own and sends the result back after every payout; the game
never sees the sign-in. Each device keeps its own running tally inside the save,
so two phones that both played since the last sync add up instead of one
overwriting the other. Played on its own or signed out, nothing leaves the phone.

## Daily challenge

One match a day, the same for every player. A small line on the first pick screen, under the map, shows the day's
goal (win the match, score a flag yourself, grab flags or pop rivals) and the bonus for clearing it; tap it to play. The
date picks the goal, world, animal and mode
from a seed (`src/daily.ts`), so nothing comes from a server: Capture three days in four and Playful the rest (never
Hoard, which can run long), 8 or 16 a side, Easy or Medium rivals, and a goal most players clear in a try or two. The
world, animal or mode may be one you haven't opened yet; the daily lets you play it for that match, and none of
the daily's picks are saved as yours.

Clearing the goal pays a 150 point bonus once a day, on top of the match's own points, and adds a day to your
streak; missing a day starts the streak again at 1. The streak lives in the save (`daily` in `src/progress.ts`), so
on TrueAIGaming.com it follows a signed-in player to any device: merging two saves keeps the run that reached the
later day. A kept match (reload, iPhone Safari dropping the tab) carries on as the daily. `?daily=1` skips the main menu and makes the
daily line pulse. `src/daily.test.ts` pins sample days so a change to the picks shows up in review.

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
  play full screen with its own icon. The Full Screen button at the bottom of Settings
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
  worlds; more scenery, patchy lawns and beaches; a soft color
  grade and vignette. It draws at the same sharpness as Normal (up to 2x).

On every level the frame rate safety net draws less sharp if the phone can't
keep 60. On High it first eases down to 1.5x, then gives up the glow, then
draws shadows every other frame, and only then goes all the way to 1x. To keep
High light, only the 10 animals nearest the camera cast shadows, the forest is
cut into patches the camera and the sun skip when out of view, and the glow is
worked out at half size.

Trees, and the posts and banner over each base, turn see-through while they
stand between the camera and your animal, so you never lose sight of yourself.
On High their shadows stay on the ground.

## The globe

The island is drawn as if it sat on a small round world: the land rolls
gently away from the camera and a horizon forms about a hundred meters out
(`src/globe.ts`). It's how big crowds stay smooth:

- Animals and whole patches of forest past the horizon aren't drawn at all.
- Only your animal and the nearest few (and flag carriers close by) get their
  full moving rig. The rest are drawn in batches, every animal of a kind and
  team in one draw, still leaning and bouncing; past 55 m they become tiny
  stand-ins in their main color, all in one draw (`src/crowd.ts`).
- Border posts, base pads and station pads are merged into one shape per
  color.
- The pin over a flag past the horizon rides along the horizon line, so you
  can still see which way it is.

The curve only changes where things are drawn; the game itself still plays
on the flat island, and shadows still line up.

## DS mode

An optional layout for playing with the phone held upright, like a two screen
handheld. The 3D game plays on the top screen; the bottom screen holds an
upright map (the enemy's land at the top, yours at the bottom) with a steering
area on the left and Jump, Throw, Item and Dive on the right (swapped for left
handed play). A hinge with two little lights sits between them.

- Turn it on or off with the DS mode row in Settings, or the "Play upright in DS mode" button on the turn your
  phone card. The choice is saved on the phone.
- Picking a map in DS mode, the top screen shows a big snapshot of it from
  above, under your animal: sideways, your base on the left and the rivals' on the right, with
  its ground, water or lava, bridges and every base, on the team size you
  picked. It changes as you flick through the maps.
- It only splits the screen while the phone is upright. Turn the phone
  sideways and the normal wide layout comes back; turn it upright again for
  the two screens. With DS mode off, an upright phone still asks to be turned.
- Full screen phones only lock to landscape with DS mode off.
- Only the bottom screen steers, so a thumb never covers the game view.
- The scoreboard sits at the top of the bottom screen, above the map, between
  the edge and the Item button; the map shrinks a little to make room for it.

## Menus and settings

- The main menu is just a list: Play, Settings, Multiplayer and Leave Game.
  Arrow keys (or W and S) and Enter work it too.
- Play leads to two steps. First the map and your animal (with the daily
  line), then NEXT to the match settings: mode, team size, role and rivals,
  with what you picked shown by PLAY (tap it to go back). Back in the corner
  goes a step back, or to the menu from the first step; Settings is there too.
- Multiplayer opens online play. Leave Game asks first, then goes back where
  you came from: on TrueAIGaming.com's play page it tells the page
  (`tag:leave`) and takes the tab back to the site; opened on its own it goes
  back a page, or closes the tab, or else goes to TrueAIGaming.com
  (`src/leave.ts`). Portal copies show only Play and Settings.
- How to Play and Full Screen are at the bottom of Settings.
- In a match, the pause button (top left) opens Resume, Settings, How to Play,
  Restart and Quit to menu. Leaving the app pauses the match too.
- Settings, saved on the phone: Music and Sounds volume (Sounds covers the
  chimes); Chimes on or off; Graphics (Low, Normal, High); Zoom; Camera turn (slow, normal, fast);
  Screen shake; Calm effects (fewer sparks, no lightning flash, a softer
  glow); Left handed (steer on the right, buttons on the left); Big buttons;
  Vibration where the phone has it; DS mode; Scoreboard. `?dev` adds the feel tuning sliders.
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

Pick 8, 16, 32 or 64 animals a side in the match settings. Each size gets its own
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

Pick MEDIC as your role in the match settings to get a FLAG button (or R): it
plants a respawn flag where you stand, once every 30 seconds, anywhere but on
the enemy's bases. Each medic keeps two up at a time, and an enemy who drives
into one knocks it down. One in eight CPU animals is a medic.

## Knockouts and kill streaks

Your knockouts are made to land: a beat of freeze, then a moment of slow
motion (offline; Calm effects skips it), a shockwave ring and a big burst at the
rival, a deep punch of sound and a rising chime, KO! popping up over them, a
camera kick, a gold glow and a buzz, and a KNOCKOUT! banner that punches in.

Knock out rivals in a row without being knocked out yourself for a kill streak
(`countStreak` in `src/sim.ts`, names in `src/streaks.ts`):

- Each knockout in a run past the first pays 3 bonus points on top of the
  usual 8, up to +15.
- The banner grows with the run: 2 IN A ROW!, ON FIRE!, RAMPAGE!,
  UNSTOPPABLE!, WILD STREAK!, then LEGENDARY! from 8. Knockouts within 4
  seconds of each other are a multi KO and take the title: DOUBLE KO!,
  TRIPLE KO!, QUAD KO!, MEGA KO!. Bigger runs bring a bigger chime, burst,
  shake and buzz.
- A flame badge under your hearts shows your run; get knocked out and it's
  gone ("POPPED! 3 STREAK LOST").
- Ending a rival's run of 3 or more is a SHUTDOWN!, worth 10 bonus points.
- A feed under the badge lists who knocked out whom, yours highlighted, with
  streak and shutdown tags (on the two biggest team sizes only yours and the
  long streaks). A rival or teammate reaching 5 or 8 in a row is called out.
- The results card shows your best streak.
- A see-through scoreboard (`src/board.ts`) lists every animal's knockouts
  (KO), times knocked out (OUT) and current streak, one column a team, the
  leaders first and you always on it, picked out in gold; animals knocked
  out right now are dimmed. With more animals than rows, the team's header
  says how many more there are. In DS mode it sits above the map on the
  bottom screen; in the wide layout, small under the minimap. It never takes
  a touch, and Settings, View can switch it off. Online, the host sends the
  numbers with each snapshot.

## The ticker

News from the match (they took a flag, team scored, hit, got an item and the
rest) no longer goes in big letters across the middle of the screen. One
block under the score (`src/ticker.ts`) says it instead: it rests on which
land you are in (YOUR LAND, MIDDLE LAND, ENEMY LAND, in the land's color),
and each piece of news rolls in from the top like a block turning over, in
its own color, holds for a beat and rolls on to the next news or back to the
land. At most three wait their turn, held for less while others wait, and the
same words never roll in twice in a row. Phones set to reduce motion get a
plain swap. The big KNOCKOUT! and streak banners still punch in on their own.

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

The Glide Fish's special is MISSILES in place of the bomb (the same button): three
homing paper missiles fanned out ahead, each after a different enemy (flag
carriers first), with a 30 second reload shown on the button. CPU Glide Fish
fire at the first enemy in range on Easy, and save the volley for a flag
carrier, a rival on their last hit or a group on Medium and Hard.

## CPU brains and difficulty

Every CPU weighs its options a few times a second, the way a player would:
carry a flag home, chase a thief, save or grab a dropped flag, steal from the
base fewest enemies guard, fight anyone close (a hurt one first), detour for a
power up, back off to heal at its last hit, escort a teammate, follow the
front as a medic, or knock down an enemy respawn flag. It reads the score and
the clock: a team trailing late pushes forward, one leading late holds. Between
decisions it dodges shots it sees coming (hopping skidding ones), aims where a
moving target is going, and carriers steer around enemies.

Each animal fights the way its kind is built to, and the mode sets what it is
after (`cpuGoal`, `flyerRoles` and `preferOwnGround` in `src/sim.ts`, tested in
`src/combat.test.ts`):

- Nobody rams in. A CPU squares up at throwing range: it comes in on its own
  side of the rival so a team rings round a target instead of stacking on it,
  slows to face it and throw, and backs off when the rival is on top of it.
  Teammates crowding close shuffle apart, so the middle is several fights
  across the island rather than one pile.
- Swimmers (Jet Shark, Surf Penguin and Ski Croc most, Pogo Frog and Bowl
  Goldfish a little less) take their fights to the water: they hold the
  channels by the bridges where raiders cross, take on a rival on the shore
  from the nearest open water, only duck under a shot actually coming at them
  while squared up, and are sent on dry land raids or guard duty far from water
  only when nobody else can go. A land animal won't wade in after a swimmer.
- Flyers work for the team from the air: they ride shotgun over a flag
  carrier, swoop on whoever is closing in on a teammate (carriers first), take
  a loaded bomb to a bunch of rivals rather than drop it on the first one they
  pass, and the Glide Fish saves its missiles for a carrier or a rival on its
  last hit. They leave a rival the ground is already on and pick their own.
- In Team Deathmatch each CPU fights over its own stretch of the front (or
  whoever comes at it) and pushes up when nobody is near; swimmers go to the
  water nearest the fighting. In Capture, Playful and Hoard the jobs come
  from the team plan as before.

Pick the rivals' level in the match settings. Your teammates always play Medium.

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

## Online matches

MULTIPLAYER on the main menu plays a live match with friends. It works on TrueAIGaming.com while signed in, since the site hands the game a signed ticket with the player's username (`tag:online`, see `src/cloud.ts`). Every phone in a room checks every ticket with the site's public key, so the only names anyone sees are real site usernames. There is no chat, and a room code is typed on an on-screen pad.

- QUICK MATCH joins the fullest open room, or opens one. An open room starts by itself 20 seconds after a second player joins.
- MAKE A ROOM gives a 4 letter code for friends; JOIN WITH A CODE takes one. The host picks the world, mode and CPU skill.
- Matches are 8 a side with up to 8 real players. CPU animals fill the empty spots at the same skill on both teams, and take over for anyone who leaves.
- Each phone sees the match from its own side, with its team in Blue at the bottom of the map, so the HUD and controls work as in single player.

How it runs: the host's phone runs the match and sends it out 20 times a second; the others send their stick and buttons 30 times a second, move their own animal ahead at once and correct to the host, and draw everyone else a tenth of a second behind. Phones meet on Supabase Realtime broadcast channels (`src/net/signal.ts`) and then link directly over WebRTC data channels (`src/net/peer.ts`); where a network blocks that, the match goes through the Realtime channel instead. Nothing is stored. The code is in `src/net/` (rooms, snapshots, inputs, the turned-round view) and `src/onlineui.ts` (the screens).

To try it without the site, open two tabs of the dev server with `?net=local&name=Ana` and `?net=local&name=Bea`: rooms then meet through the browser's BroadcastChannel.

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
- Air: Sky Eagle (the bomber), Glide Fish (turns well, fires homing missiles
  instead of a bomb) and Night Bat (fastest flyer, fragile). They fly on their
  own, with a bomb (or missiles) and a confetti gun.

CPU animals are mirrored slot by slot across the teams, and the rival in your
slot rides your animal, so neither side starts with the better line up.

The game opens on the main menu, then the two pick steps; a match counts down
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

- `src/sim.ts`: the match, stepped at a fixed 60 Hz from a seed, no Three.js. `src/lineup.ts`: which animals the CPUs ride on each world.
- `src/terrain.ts`: the maps and their three land height field, shared by sim, render and tests.
- `src/worlds.ts`: the eight worlds' shapes, colors, trees and twists.
- `src/progress.ts`: points, unlocks and best scores, with per-device tallies and the merge. `src/cloud.ts`: account saves through the TrueAIGaming play page.
- `src/animals.ts`: per animal speeds by medium and shot stats.
- `src/critters.ts`: the animal models and their rigs.
- `src/main.ts`, `src/world.ts`, `src/models.ts`, `src/fx.ts`: rendering. `src/look.ts`: the Graphics levels, shadows and the High passes. `src/globe.ts`: the curved world and its horizon. `src/crowd.ts`: crowds drawn in batches.
- `src/hud.ts`, `src/input.ts`, `src/audio.ts`: menus, thumbs, HUD, sound, chimes and animal mood tones.
- `src/cues.ts`: the cue chimes for big moments. `src/settings.ts`: saved player settings.
- `src/board.ts`: who makes the scoreboard. `src/ticker.ts`: the ticker's queue of news.
