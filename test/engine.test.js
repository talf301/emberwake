import test from 'node:test';
import assert from 'node:assert/strict';
import * as E from '../js/engine.js';
import { CARDS, ENEMIES, RULES } from '../js/data.js';
import { legalActions, mulberry, playSmart } from '../tools/bot.js';

const ok = (s, a) => { const r = E.act(s, a); assert.ok(r.ok, `${JSON.stringify(a)} -> ${r.error}`); };
const bad = (s, a) => { const r = E.act(s, a); assert.ok(!r.ok, `${JSON.stringify(a)} should be illegal`); return r.error; };

function cardCount(s) {
  const h = s.hero;
  return [...h.deck, ...h.hand, ...h.discard, ...h.played].filter((c) => c !== 'wound').length;
}
function setHand(s, cards) { s.hero.hand = [...cards]; }
// put the hero next to a fresh site with the given enemies
function arena(s, type, enemies) {
  const k = E.neighbors(s.hero.pos).find((n) => s.map[n]);
  s.map[k].terrain = 'plains';
  s.map[k].revealed = true;
  s.map[k].site = { type, enemies: [...enemies], seen: true };
  return k;
}

test('new game is well formed and deterministic', () => {
  const a = E.newGame(42, 'kaela');
  const b = E.newGame(42, 'kaela');
  assert.deepEqual(a, b);
  assert.equal(a.hero.hand.length, 5);
  assert.equal(cardCount(a), 16);
  assert.equal(a.map[a.goal].site.type, 'citadel');
  assert.notDeepEqual(E.newGame(43, 'kaela').map, a.map);
});

test('every map has its key sites and a reachable citadel', () => {
  for (let seed = 1; seed <= 150; seed++) {
    const s = E.newGame(seed);
    const types = Object.values(s.map).filter((h) => h.site).map((h) => h.site.type);
    for (const t of ['village', 'keep', 'spire', 'sanctum', 'barrow', 'camp', 'citadel']) {
      assert.ok(types.includes(t), `seed ${seed} lacks ${t}`);
    }
    // flood fill ignoring nothing: citadel must have a reachable neighbour
    const seen = new Set([s.start]);
    const q = [s.start];
    while (q.length) {
      const cur = q.pop();
      for (const n of E.neighbors(cur)) {
        if (!s.map[n] || seen.has(n) || E.isBlocked(s.map[n])) continue;
        seen.add(n); q.push(n);
      }
    }
    assert.ok(E.neighbors(s.goal).some((n) => seen.has(n)), `seed ${seed}: citadel unreachable`);
    for (const h of Object.values(s.map)) {
      if (!h.site) continue;
      const k = E.key(h.q, h.r);
      assert.ok(seen.has(k) || E.neighbors(k).some((n) => seen.has(n)), `seed ${seed}: ${h.site.type} unreachable`);
    }
  }
});

test('movement needs enough Move and respects terrain', () => {
  const s = E.newGame(7);
  const to = Object.keys(E.moveOptions(s))[0];
  assert.match(bad(s, { type: 'move', to }), /Needs 2 Move/);
  setHand(s, ['trailcraft', 'wound']);
  ok(s, { type: 'play', index: 0, mode: 'basic' });
  assert.equal(s.turn.move, 2);
  ok(s, { type: 'move', to });
  assert.equal(s.hero.pos, to);
  assert.equal(s.turn.move, 0);
  bad(s, { type: 'move', to: '99,99' });
});

test('night changes forest cost', () => {
  const s = E.newGame(7);
  const k = Object.keys(E.moveOptions(s))[0];
  s.map[k].terrain = 'forest';
  assert.equal(E.moveCost(s, k), 3);
  s.night = true;
  assert.equal(E.moveCost(s, k), 4);
});

test('empowering needs essence; tide, channel and shards can pay', () => {
  const s = E.newGame(7, 'orrin');
  s.hero.shards = { ember: 0, frost: 0, verdant: 0, radiant: 0 };
  setHand(s, ['hewing_blow', 'forced_march', 'trailcraft', 'fair_words']);
  // ember is not a day tide aspect
  assert.match(bad(s, { type: 'play', index: 1, mode: 'strong' }), /ember essence/);
  ok(s, { type: 'play', index: 0, mode: 'channel' });
  assert.equal(s.hero.essence.ember, 1);
  ok(s, { type: 'play', index: 0, mode: 'strong' }); // forced march now index 0
  assert.equal(s.turn.move, 5);
  assert.equal(s.hero.essence.ember, 0);
  // verdant is paid by the day tide once
  ok(s, { type: 'play', index: 0, mode: 'strong' });
  assert.equal(s.turn.move, 9);
  assert.equal(s.turn.tide, false);
  assert.equal(E.essenceAvail(s, 'radiant'), 0);
});

test('attack cards are useless outside battle', () => {
  const s = E.newGame(7);
  setHand(s, ['hewing_blow']);
  bad(s, { type: 'play', index: 0, mode: 'basic' });
  bad(s, { type: 'play', index: 0, mode: 'improv:attack' });
  ok(s, { type: 'play', index: 0, mode: 'improv:move' });
});

test('battle: volley, guard, damage, attack', () => {
  const s = E.newGame(7);
  const k = arena(s, 'camp', ['ash_goblins', 'wolf_riders']);
  setHand(s, ['hunters_shot', 'rime_dart', 'shieldwork', 'hewing_blow', 'steady_hand', 'trailcraft']);
  ok(s, { type: 'attack', hex: k });
  assert.equal(s.combat.phase, 'volley');
  bad(s, { type: 'play', index: 3, mode: 'basic' }); // melee not allowed in volley
  ok(s, { type: 'play', index: 0, mode: 'basic' }); // ranged 2
  ok(s, { type: 'play', index: 0, mode: 'basic' }); // frost ranged 1
  assert.match(bad(s, { type: 'strike', targets: [1] }), /Needs 4/);
  ok(s, { type: 'strike', targets: [0] }); // goblins armor 3
  assert.equal(s.hero.renown, 2);
  ok(s, { type: 'next' });
  assert.equal(s.combat.phase, 'guard');
  ok(s, { type: 'play', index: 0, mode: 'basic' }); // block 3; wolf riders are swift: need 6
  assert.match(bad(s, { type: 'guard', enemy: 1 }), /Needs 6/);
  ok(s, { type: 'next' });
  assert.equal(s.combat.phase, 'damage');
  bad(s, { type: 'next' });
  ok(s, { type: 'assign', enemy: 1, target: 'hero' }); // 3 damage vs armor 2 = 2 wounds
  assert.equal(E.woundsInHand(s), 2);
  assert.equal(s.combat.phase, 'attack');
  ok(s, { type: 'play', index: 0, mode: 'basic' }); // hewing blow 2
  ok(s, { type: 'play', index: 0, mode: 'basic' }); // steady hand: only attack applies -> auto
  assert.equal(s.pending.length, 0);
  ok(s, { type: 'strike', targets: [1] });
  assert.equal(s.combat, null);
  assert.equal(s.map[k].site.conquered, true);
  assert.equal(s.hero.standing, 1);
  assert.equal(s.hero.renown, 5);
  assert.equal(s.hero.level, 2);
  // level 2 rewards wait as pending choices
  assert.equal(s.pending.length, 2);
  assert.equal(s.pending.at(-1).kind, 'advanced');
  bad(s, { type: 'endTurn' });
  ok(s, { type: 'choose', index: 0 });
  ok(s, { type: 'choose', index: 0 });
  assert.equal(s.hero.skills.length, 1);
  assert.equal(CARDS[s.hero.deck[0]].kind, 'advanced');
  ok(s, { type: 'endTurn' });
});

test('resistance halves, walls stop ranged volleys, element blocks', () => {
  const s = E.newGame(9);
  const k = arena(s, 'keep', ['ironclads']);
  setHand(s, ['hunters_shot', 'hewing_blow', 'hewing_blow', 'cinder_lash', 'shieldwork']);
  ok(s, { type: 'attack', hex: k });
  assert.equal(s.hero.standing, -1);
  ok(s, { type: 'play', index: 0, mode: 'basic' });
  assert.equal(E.strikePower(s, [0]), 0); // walled: ranged does not count in volley
  ok(s, { type: 'next' });
  ok(s, { type: 'play', index: 3, mode: 'basic' });
  assert.match(bad(s, { type: 'guard', enemy: 0 }), /Needs 4 block, you have 3/);
});

test('guard fails when block is short, and ember attack halves plain block', () => {
  const s = E.newGame(9);
  const k = arena(s, 'camp', ['cinder_hounds']);
  setHand(s, ['shieldwork', 'shieldwork', 'sidestep']);
  s.hero.shards.frost = 1;
  ok(s, { type: 'attack', hex: k });
  ok(s, { type: 'next' });
  ok(s, { type: 'play', index: 0, mode: 'basic' });
  ok(s, { type: 'play', index: 0, mode: 'basic' });
  assert.equal(E.blockPower(s, 0), 3); // 6 plain block halved
  bad(s, { type: 'guard', enemy: 0 });
  ok(s, { type: 'play', index: 0, mode: 'strong' }); // frost block 4: full
  assert.equal(E.blockPower(s, 0), 7);
  ok(s, { type: 'guard', enemy: 0 });
  assert.equal(s.combat.phase, 'guard');
  ok(s, { type: 'next' }); // nothing unguarded -> straight to attack
  assert.equal(s.combat.phase, 'attack');
  ok(s, { type: 'next' });
  assert.equal(s.combat, null);
  assert.deepEqual(s.map[k].site.enemies, ['cinder_hounds']);
});

test('physical resistance halves physical attack', () => {
  const s = E.newGame(9);
  const k = arena(s, 'camp', ['ironclads']);
  setHand(s, ['hewing_blow', 'hewing_blow', 'cinder_lash']);
  ok(s, { type: 'attack', hex: k });
  ok(s, { type: 'next' });
  ok(s, { type: 'next' });
  ok(s, { type: 'assign', enemy: 0, target: 'hero' });
  ok(s, { type: 'play', index: 0, mode: 'basic' });
  ok(s, { type: 'play', index: 0, mode: 'basic' });
  assert.equal(E.strikePower(s, [0]), 2);
  ok(s, { type: 'play', index: 0, mode: 'basic' }); // ember 3, unresisted
  assert.equal(E.strikePower(s, [0]), 5);
  ok(s, { type: 'strike', targets: [0] });
});

test('companions absorb damage; venom slays them; brutal doubles', () => {
  const s = E.newGame(11);
  s.hero.units = [{ id: 'shieldmaidens', spent: false, wounded: false }, { id: 'levy', spent: false, wounded: false }];
  const k = arena(s, 'ruins', ['keep_captain', 'marsh_hag']);
  s.hero.pos = k;
  setHand(s, ['trailcraft']);
  ok(s, { type: 'attack', hex: k });
  ok(s, { type: 'next' });
  ok(s, { type: 'next' });
  assert.equal(s.combat.enemies[0].remaining, 6); // brutal 3 x2
  ok(s, { type: 'assign', enemy: 0, target: 0 }); // shieldmaidens armor 5
  assert.equal(s.combat.enemies[0].remaining, 1);
  bad(s, { type: 'assign', enemy: 0, target: 0 });
  ok(s, { type: 'assign', enemy: 0, target: 'hero' });
  assert.equal(E.woundsInHand(s), 1);
  ok(s, { type: 'assign', enemy: 1, target: 1 }); // venom slays levy
  assert.equal(s.hero.units.length, 1);
  assert.equal(s.hero.units[0].wounded, true);
  assert.equal(s.combat.phase, 'attack');
});

test('venom adds wounds to discard; knockout discards hand', () => {
  const s = E.newGame(11);
  const k = arena(s, 'camp', ['marsh_hag', 'bog_troll', 'bog_troll']);
  setHand(s, ['trailcraft', 'fair_words', 'attune', 'shieldwork', 'sidestep']);
  ok(s, { type: 'attack', hex: k });
  ok(s, { type: 'next' });
  ok(s, { type: 'next' });
  ok(s, { type: 'assign', enemy: 0, target: 'hero' });
  assert.equal(E.woundsInHand(s), 2);
  assert.equal(s.hero.discard.filter((c) => c === 'wound').length, 2);
  ok(s, { type: 'assign', enemy: 1, target: 'hero' });
  ok(s, { type: 'assign', enemy: 2, target: 'hero' });
  assert.ok(s.hero.hand.every((c) => c === 'wound'));
});

test('shops: recruit, command limit, standing modifier, heal', () => {
  const s = E.newGame(5);
  s.map[s.hero.pos].site = { type: 'village', enemies: [], seen: true };
  s.offers.units = ['levy', 'knight', 'siege_crew'];
  setHand(s, ['fair_words', 'fair_words', 'wound', 'trailcraft']);
  let shop = E.shopOptions(s);
  assert.deepEqual(shop.recruits.map((r) => r.id), ['levy', 'knight']);
  bad(s, { type: 'recruit', id: 'levy' });
  ok(s, { type: 'play', index: 0, mode: 'basic' });
  s.hero.standing = 2; // +1 sway
  assert.equal(E.swayAvail(s), 3);
  ok(s, { type: 'recruit', id: 'levy' });
  assert.equal(E.swayAvail(s), 0);
  bad(s, { type: 'play', index: 2, mode: 'basic' }); // cannot move after interacting
  ok(s, { type: 'play', index: 0, mode: 'strong' }); // radiant tide: sway 4
  assert.match(bad(s, { type: 'recruit', id: 'knight' }), /command/);
  ok(s, { type: 'buyHeal' });
  assert.equal(E.woundsInHand(s), 0);
  bad(s, { type: 'recruit', id: 'siege_crew' });
});

test('recover, end-turn rule and round cycle', () => {
  const s = E.newGame(5);
  assert.match(bad(s, { type: 'endTurn' }), /at least one card/);
  bad(s, { type: 'endRound' });
  setHand(s, ['wound', 'trailcraft', 'wound']);
  ok(s, { type: 'recover', index: 1 });
  assert.equal(s.hero.hand.length, 0);
  ok(s, { type: 'endTurn' });
  assert.equal(s.hero.hand.length, 5);
  const total = cardCount(s);
  s.hero.discard.push(...s.hero.deck);
  s.hero.deck = [];
  ok(s, { type: 'endRound' });
  assert.equal(s.round, 2);
  assert.equal(s.night, true);
  assert.equal(cardCount(s), total);
  assert.equal(s.hero.hand.length, 5);
  s.round = RULES.rounds;
  s.hero.discard.push(...s.hero.deck);
  s.hero.deck = [];
  ok(s, { type: 'endRound' });
  assert.equal(s.phase, 'over');
  assert.equal(s.over.won, false);
  bad(s, { type: 'endTurn' });
});

test('taking the citadel wins', () => {
  const s = E.newGame(5);
  const k = arena(s, 'citadel', ['ash_goblins']);
  setHand(s, ['hewing_blow', 'hewing_blow']);
  ok(s, { type: 'attack', hex: k });
  ok(s, { type: 'next' });
  ok(s, { type: 'next' });
  ok(s, { type: 'assign', enemy: 0, target: 'hero' });
  ok(s, { type: 'play', index: 0, mode: 'basic' });
  ok(s, { type: 'play', index: 0, mode: 'basic' });
  ok(s, { type: 'strike', targets: [0] });
  assert.equal(s.phase, 'over');
  assert.equal(s.over.won, true);
  assert.ok(s.over.score > 15);
});

test('relic unleash removes the card; arcana cost essence', () => {
  const s = E.newGame(5);
  const k = arena(s, 'camp', ['bog_troll']);
  setHand(s, ['wyrmtooth', 'firestorm']);
  s.hero.shards.ember = 0;
  const before = cardCount(s);
  ok(s, { type: 'attack', hex: k });
  assert.match(bad(s, { type: 'play', index: 1, mode: 'basic' }), /ember essence/);
  s.hero.shards.ember = 1;
  ok(s, { type: 'play', index: 1, mode: 'basic' });
  ok(s, { type: 'strike', targets: [0] });
  assert.equal(s.combat, null);
  assert.equal(cardCount(s), before);
});

test('random play never breaks the rules engine', () => {
  for (let seed = 1; seed <= 120; seed++) {
    const rand = mulberry(seed * 977);
    const s = E.newGame(seed, seed % 2 ? 'kaela' : 'orrin');
    let steps = 0;
    while (s.phase !== 'over' && steps++ < 6000) {
      const acts = legalActions(s);
      assert.ok(acts.length > 0, `seed ${seed}: no legal action (softlock) at step ${steps}`);
      // bias towards ending turns so games finish
      let a = acts[Math.floor(rand() * acts.length)];
      const end = acts.find((x) => x.type === 'endRound') || acts.find((x) => x.type === 'endTurn');
      if (end && rand() < 0.25) a = end;
      const r = E.act(s, a);
      assert.ok(r.ok, `seed ${seed}: enumerated action rejected ${JSON.stringify(a)}: ${r.error}`);
      const h = s.hero;
      assert.ok(h.units.length <= h.command, 'command limit');
      assert.ok(Object.values(h.shards).every((n) => n >= 0 && n <= RULES.shardCap), 'shard bounds');
      assert.ok(Object.values(h.essence).every((n) => n >= 0), 'essence bounds');
      assert.ok(s.turn.move >= 0, 'move bounds');
      assert.ok(!E.isBlocked(s.map[h.pos]), 'hero on legal hex');
      JSON.stringify(s);
    }
    assert.equal(s.phase, 'over', `seed ${seed}: game did not finish`);
  }
});

test('heuristic bot finishes games and sometimes wins', () => {
  let wins = 0;
  for (let seed = 1; seed <= 40; seed++) {
    const s = playSmart(seed);
    assert.equal(s.phase, 'over', `seed ${seed} did not finish`);
    if (s.over.won) wins++;
  }
  assert.ok(wins >= 1, 'the game should be winnable by a simple bot');
});

test('enemy data sanity', () => {
  for (const e of Object.values(ENEMIES)) {
    assert.ok(e.armor > 0 && e.attack > 0 && e.renown > 0, e.id);
  }
});
