# Brief: Emberwake UI guide (Claude artifact)

## What to make

One Claude artifact: a detailed, illustrated guide to the phone interface of **Emberwake**, an original solo
deck-building hex adventure PWA. The repository is `/Users/tal/Documents/emberwake` (this folder is
`docs/ui-guide/` inside it).

- **Audience:** Tal (the owner, who plays it on an iPhone) and another coding agent who will take over UI work.
  The agent needs to know what each screen is, what every control does, which engine call backs it, and where
  the code lives.
- **Purpose:** explain the UI screen by screen with the screenshots in `shots/`, plus worked examples of
  complete interactions (tap by tap).
- **Access:** keep the artifact private. Do not share it or change its audience.

## Deliverables

1. **Local source saved first:** `docs/ui-guide/index.html` (in this folder). One self-contained HTML file: inline
   CSS, no external requests, screenshots embedded as data URIs. Downscale each screenshot to 390 px wide before
   embedding (the PNGs are 780x1520; `magick in.png -resize 390x out.png` or JPEG quality ~85 is fine) so the page
   stays a reasonable size. Keep the downscaled files in `docs/ui-guide/embedded/`. If you use a build script to
   assemble the page, save it as `docs/ui-guide/build.py` (or `.mjs`) so the page can be regenerated.
2. **The hosted artifact** created from that source with your Artifact tool.
3. **Report back** in your final message: the local source path, the real hosted URL from the Artifact tool result,
   and its access status. If the Artifact tool is unavailable, say exactly why and stop after saving the local source.
   Do not substitute another hosting service.

Do not edit anything outside `docs/ui-guide/`. Do not commit or push.

## Sources of truth

Read these rather than trusting this brief where they differ:

- `public/app.mjs`: the whole interface. Functions named below are in this file.
- `public/style.css`: layout and theme.
- `public/engine/engine.js`, `public/engine/data.js`: rules and content. The UI computes no rules; it calls
  `E.act(state, action)` and option helpers (`moveOptions`, `attackOptions`, `cardOptions`, `unitOptions`,
  `shopOptions`, `pendingOptions`, `strikePower`, `blockPower`, `endTurnBlocker`, `canEndRound`, `canRecover`).
- `README.md`: layout, dev query parameters, design rulings.
- `shots/*.png`: 23 screenshots at 390x760 (2x), taken with `tools/shot.sh`. Each was produced by the query string
  listed below, so an agent can reproduce it.

## Page design

- Dark theme matching the game: background `#14100e`, panels `#211a16`/`#2c231d`, gold `#d9b25f`, ink `#efe3c8`,
  muted `#a8977a`, ember `#e2552d`, frost `#4aa8e0`, verdant `#5fae4a`, radiant `#e6c15a`. Serif headings
  (Cochin/Palatino/Georgia stack), system sans body. No web fonts.
- Readable on a laptop and a phone. Each screenshot sits beside (or above, on narrow screens) its explanation,
  shown in a rounded phone-like frame at about 300 px wide.
- Annotate screenshots with numbered callouts where it helps: numbered markers positioned over the image with
  percentage coordinates, matched to a numbered list beside it. Check marker positions against the image.
- A sticky or top table of contents. Sections in the order below.
- Use at least one diagram where it earns its place: the screen layout regions, and the battle phase flow
  (Volley -> Guard -> Damage -> Strike). Inline SVG or HTML/CSS, not images.
- Plain, concise technical English. No marketing tone.

## Content outline and facts

### 1. Overview
Portrait, one-handed. The game screen is a column (`renderGame()`): top bar, stage (map or battle), resource
strip, hint line, action bar, party row, hand. Everything else is a bottom sheet (`renderSheet()`), opened over the
game and closed by tapping the dark backdrop. A sheet that needs a decision (pending choice, game over) is modal.
All taps go through one delegated click handler keyed on `data-act` (the `ACTS` table); map hexes are the
exception and use pointer events (`onHexTap`) so the map can also pan and pinch. Every state change goes through
`dispatch(action)`, which calls the engine, shows its error as a toast if refused, saves to `localStorage`, and
re-renders.

### 2. Title screen (`renderTitle`) - `01-title.png`
Hero choice (Kaela Cinderblade, Orrin Wayfarer), New game, Continue (only when a save exists), How to play, version
stamp at the bottom (from `version.mjs`, content hash; "dev" when unbuilt).

### 3. The game screen - `02-map-start.png`, `22-midgame.png`
- **Top bar (`topHTML`)**: six round pips (sun = day, moon = night; current one glows), "Day 1 / turn 1/8",
  renown star with next-level threshold and level, armor, standing, menu. The three stat pills open the Hero sheet.
- **Stage**: the hex map (`mapSVG`). Drag to pan, pinch to zoom, compass button recentres on the hero, book button
  opens the chronicle (log). Unexplored hexes are dark. A label top-left states the day/night sight rule.
- **Map symbols**: terrain art per hex (plains, forest, hills, marsh, ash wastes, mountain, lake). Site badge: gold
  ring = neutral or friendly, red ring = defended, green ring = conquered, dimmed = used up. A small red number =
  several defenders. The hero is the coloured token with a helm.
- **Resource strip (`stripHTML`)**: Move, Sway, Heal (when banked), Essence (coloured dots; the "sun:"/"dusk:" pair
  is the free essence the sky offers this turn), Shards (diamonds), Deck count. Tapping Essence/Shards or Deck opens
  their sheets. Scrolls sideways.
- **Hint line (`hintText`)**: one sentence telling the player what to do next.
- **Action bar (`actionsHTML`)**: Undo (left), then context buttons: Site (when standing on one), Recover (when wounds
  are in hand and nothing done yet), End day/night (when the deck is empty at the start of a turn; "Concede" in the
  final round), End turn. End turn looks dim while the engine would refuse it; tapping it shows why.
- **Party row (`partyHTML`)**: companions (solid pill; dim = spent, red with a cross = wounded) and skills (dashed pill).
- **Hand (`handHTML`)**: cards overlap to fit. A dimmed card has no playable effect right now (it can still be
  channelled). Tap a card to open its sheet.

### 4. Cards - `03-card-sheet.png`, `16-essence.png`
Card anatomy (`cardHTML`): aspect colour (Ember red, Frost blue, Verdant green, Radiant gold, Relic purple, Wound
dark red), name, glyph, light box = basic effect, dark box = empowered effect with a coloured pip per essence it
costs. Corner marks: triangle = advanced, four-point star = arcana, diamond = relic.
Card sheet (`cardSheet`) buttons: **Play** (basic), **Empower** (costs essence of the card's aspect; arcana cost 1 to
play and 2 to overcast; a relic's second effect is **Unleash**, which destroys it), **Channel** (discard for one
essence of its aspect; not relics), four **Improvise** buttons (Move 1, Sway 1, Attack 1, Block 1), **Discard**.
A disabled button shows the reason. A button warns when part of an effect would be lost.
Essence is paid in this order: channelled essence, then the free sky essence (Radiant or Verdant by day, Ember or
Frost by night, once per turn), then stored shards (max 3 per aspect).

### 5. Moving - `04-move-ready.png`, `05-hex-info.png`, `19-night.png`
After Move points are gained, adjacent hexes that can be entered glow with a cost badge: green = affordable, grey
dashed = not enough Move. Tap a glowing hex to move; the map recentres. Tapping any other revealed hex opens the hex
sheet (`hexSheet`) with terrain, cost by day and night, site rules and known defenders. Night tints the map; sight
drops from 2 hexes to 1; forest costs 4 and ash wastes 3. Leaving a hex next to a camp or lair costs +1.

### 6. Starting a fight - `06-attack-confirm.png`
Hexes that can be attacked pulse red with a sword badge. Tapping one opens the hex sheet with the defenders and a
red **Attack** button (a confirmation step). Camps, lairs, keeps, spires and the citadel are attacked from an
adjacent hex; barrows and ruins from inside the hex.

### 7. Battle (`battleHTML`) - `07-battle-volley.png`, `08-battle-guard.png`, `09-battle-damage.png`, `10-battle-strike.png`, `23-citadel.png`
The stage becomes the battle panel. Phase tabs across the top show progress. Foe cards (`foeHTML`) show glyph, name,
armor, attack (coloured if Ember or Frost), trait and resistance tags, and a stamp when Defeated, Guarded or Snared.
Below is the readout: the live preview of what would happen, with the sums, and the phase's commit button.
- **Volley**: play Ranged/Siege cards; tap foes to target (gold outline); readout shows "Power X vs Armor Y" in green
  when enough; **Strike**. Behind walls only Siege counts; Warded foes cannot be targeted yet. Action bar: "To Guard".
- **Guard**: tap one foe; play Block; readout shows "Block X of Y", the damage if unguarded, and element or Swift
  notes; **Guard**. Action bar: "Take the hits" (or "To Strike" if nothing is unguarded).
- **Damage**: for each unguarded foe, choose "Take N wounds" or let an unwounded companion absorb its armor's worth.
  The action bar button is disabled until all damage is assigned.
- **Strike**: all attack counts; same targeting and readout; action bar: "Break off" (survivors keep the site) or
  "End battle".
Attack played in an earlier phase is kept for the Strike. A strike spends all attack of the kinds that count.
If any target resists an element, that element is halved for the whole strike.

### 8. Choices and rewards (`pendingSheet`) - `11-reward.png`
Modal sheets for: "choose one" effects, which aspect to gain, which companion to ready, which foe to snare or weaken,
and rewards (skill on even levels, advanced card, arcana from a spire, relic from a barrow, ruin or lair). Cards
taken go on top of the deck.

### 9. Sites and trading (`hexSheet` + `shopHTML`) - `12-shop.png`, `21-companion.png`
The Site button opens the sheet for the hero's hex. Villages, sanctums, conquered keeps and conquered spires trade:
Sway available (including the Standing modifier), healer, companions with cost and command slots, cards for sale.
Play Sway cards first, then open Site. Trading ends movement for the turn. Companion sheet (`unitSheet`): abilities
(one use spends them for the round), heal when wounded, Dismiss.

### 10. Wounds and recovery - `13-recover.png`
Wound cards in hand; the wound's sheet explains them and offers "Heal this wound" when Heal is banked. Recover sheet:
give up one card to send every wound in hand to the discard pile; it uses the whole turn.

### 11. Hero, cards, menu, rules - `14-hero.png`, `15-deck.png`, `17-menu.png`, `18-rules.png`
Hero sheet (level, armor, hand limit, command, standing, score, skills). Cards sheet (deck, discard, played; deck
order hidden). Menu (How to play, Hero, Cards, Chronicle, Save and quit, Abandon; version and seed). How to play is
the in-app rulebook.

### 12. End of game (`resultSheet`) - `20-victory.png`
Modal result with score, level, foes defeated, sites taken.

### 13. Worked examples (tap by tap)
Write these as numbered steps with the relevant screenshots:
1. **Move two hexes with an empowered card** (seed 7, first turn): tap Trailcraft -> Empower (the free daytime
   Verdant essence pays) -> Move 4 -> tap a glowing hex (cost 2) -> tap another. Shots 02, 03, 04.
2. **A whole battle against Wolf Riders and Cinder Hounds** (the `dev=combat` scenario; hand: Hunter's Shot,
   Shieldwork, Hewing Blow, Cinder Lash, Sidestep, Steady Hand; one Shieldmaidens companion). Walk through all four
   phases using shots 06-10: why Ranged 2 cannot kill in the Volley; why Wolf Riders (Swift, attack 3) need Block 6;
   why plain block is halved against the Hounds' Ember attack; assigning damage (Shieldmaidens absorb 5, hero armor 2
   means 3 damage = 2 wounds, 4 damage = 2 wounds); striking Wolf Riders with Hewing Blow 2 + Cinder Lash Ember 3 =
   Power 5 vs Armor 4; and why adding the Ember-resistant Hounds to the same strike would halve the Ember part.
   Check each number against `data.js` before writing it.
3. **Recruit and heal at a sanctum** (the `dev=shop` scenario). Shot 12.
4. **Recover from wounds**. Shot 13.

### 14. For the next agent
- File map: `app.mjs` function per screen (list them), `style.css` sections, engine helpers the UI calls.
- How a tap flows: `data-act` -> `ACTS[...]` -> `dispatch()` -> `E.act()` -> `save()` -> `render()`.
- Undo: snapshots are kept until `state.irrev` changes (a draw, reveal or shuffle).
- Dev query parameters (from README): `?seed=`, `?hero=`, `?auto=N`,
  `?dev=combat|guard|damage|strike|camp|citadel|shop|levelup|reward|night|explored|won`, `?sheet=TYPE&i=N`,
  `?click=sel;sel` (also `hex:q,r` entries). `tools/shot.sh out.png 'query' 760` needs `npm run serve` (port 8477).
- Known limits: checked in headless Chrome only, at 660 and 760 px tall. One real-phone fault found and fixed so far:
  the click that follows a hex tap closed the sheet it had just opened (see `swallowClickUntil`). Real touch
  behaviour, safe areas and the installed look are otherwise unverified.

## Screenshot index (file -> query string used)

| File | Query |
|---|---|
| 01-title.png | (none) |
| 02-map-start.png | `seed=7` |
| 03-card-sheet.png | `seed=7&sheet=card&i=2` |
| 04-move-ready.png | `seed=7&click=.hand .card:nth-child(3) .c-art svg;[data-mode="strong"]` |
| 05-hex-info.png | `dev=explored&click=hex:2,5` |
| 06-attack-confirm.png | `dev=camp&click=hex:0,9` |
| 07-battle-volley.png | `dev=combat&click=.hand .card:nth-child(1) .c-art svg;[data-mode="basic"];.foe:nth-child(2) .f-art svg` |
| 08-battle-guard.png | `dev=guard&click=.hand .card:nth-child(2) .c-art svg;[data-mode="basic"]` |
| 09-battle-damage.png | `dev=damage` |
| 10-battle-strike.png | `dev=strike&click=.hand .card:nth-child(3) .c-art svg;[data-mode="basic"];.hand .card:nth-child(3) .c-art svg;[data-mode="basic"];.foe:nth-child(1) .f-art svg` |
| 11-reward.png | `dev=levelup` |
| 12-shop.png | `dev=shop&sheet=hex` |
| 13-recover.png | `dev=night&sheet=recover` |
| 14-hero.png | `dev=shop&sheet=hero` |
| 15-deck.png | `seed=7&sheet=deck` |
| 16-essence.png | `seed=7&sheet=essence` |
| 17-menu.png | `seed=7&sheet=menu` |
| 18-rules.png | `seed=7&sheet=rules` |
| 19-night.png | `dev=night` |
| 20-victory.png | `dev=won` |
| 21-companion.png | `dev=shop&sheet=unit&i=0` |
| 22-midgame.png | `seed=11&auto=16&hero=orrin` |
| 23-citadel.png | `dev=citadel` |

Look at every screenshot before describing it; describe what is actually in the image.
