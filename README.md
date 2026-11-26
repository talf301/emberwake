# Emberwake

An original solo deck-building hex adventure for the phone, installable as a PWA and playable offline.
It is in the genre of adventure deck-builders (cards for movement, combat and influence; a hex map to
explore; levelling; companions), but its name, rules text, cards, foes, map and art are its own. It uses
no material from any published game.

## Play

```sh
npm run serve          # serves the repository root on http://127.0.0.1:8477
open http://127.0.0.1:8477/public/
```

On a phone the site must be served over HTTPS to install and work offline (see Publishing).
The in-app **How to play** sheet is the rulebook.

## Layout

```
public/            the site: index.html, app.mjs, style.css, art.js, engine/, sw.js, version.mjs
public/engine/     data.js (all content), engine.js (all rules; no DOM, runs under Node)
tools/             build_sw.py (service worker + version), shot.sh + frame.html (phone screenshots), sim.js, make_icons.sh
tests/             engine.test.js (rules cases, random-play fuzz, bot), helpers.mjs (bots)
docs/PROGRESS.md   local status
```

No bundler and no dependencies. `npm test` runs the rules tests. `npm run sim` prints a balance read-out
from the heuristic bot. After any change under `public/`, run `python3 -I tools/build_sw.py public emberwake`.

## How it works

- State is one plain JSON object with a seeded generator inside it. `act(state, action)` validates and
  applies every player decision; the interface computes no rules and only shows what the engine says is legal.
- Saved to `localStorage` after every action. Undo is allowed until hidden information changes
  (a draw, a reveal, a shuffle), tracked by `state.irrev`.
- Art is original SVG: glyphs in `public/art.js`, terrain and cards drawn in code.

## Development query parameters

`?seed=7&hero=orrin` new game from a seed; `?auto=20` let the bot play 20 turns first;
`?dev=combat|guard|damage|strike|camp|citadel|shop|levelup|reward|night|explored|won` jump to a prepared state;
`?sheet=card&i=2` open a sheet; `?click=sel;sel` click elements in order.
`tools/shot.sh out.png 'dev=combat' 660` screenshots the app in a 390 px frame.

## Design rulings

- A fight is started from an adjacent hex (camps, lairs, keeps, spires, the citadel) or from inside the hex
  (barrows, ruins). Winning a walled site moves you in.
- Defeated foes stay defeated; survivors keep the site.
- A strike spends all attack of the kinds that count in that phase, even if more than needed.
- Ranged attack not spent in the Volley carries into the Strike phase.
- If any chosen target resists an element, all attack of that element in the strike is halved.
- A single foe can inflict at most as many wounds as your hand limit.
- A day or night ends when you choose (deck empty, start of a turn) or after 8 turns.
