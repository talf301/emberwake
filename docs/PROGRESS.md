# Progress

Local tracking (not Linear), as Tal asked.

## Done
- Game design: original rules and content (`public/engine/data.js`).
- Rules engine with seeded randomness and validated actions (`public/engine/engine.js`).
- Tests: 28 pass. Rules cases, 120-game random fuzz with invariants, heuristic bot, one case per review finding.
- Phone interface: title, map with pan and pinch, battle screen, sheets, shop, rewards, rules, undo, autosave.
- Original SVG glyph set (92 glyphs), app icons, manifest, service worker with content-hash version.
- Independent rules-versus-engine review: 13 findings, all fixed.
- Screens checked at 660 and 760 px in a 390 px frame; scripted taps through a move turn, a battle and a shop.
- Balance read-out: the simple bot wins 28% of 300 games.

## Open
- Hosting decision (Tal): HTTPS is needed to install on the phone and play offline.
- Not verifiable here: real touch behaviour, safe areas and the installed look on an iPhone.
- Balance is tuned only against the bot, not by human play.
