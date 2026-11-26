// Emberwake rules engine. Mutates a plain JSON-serialisable state object.
// Every player input goes through act(state, action), which validates it.
import {
  ASPECTS, CARDS, STARTER_DECK, HEROES, ENEMIES, COMPANIONS, SKILLS,
  LEVEL_THRESHOLDS, TERRAIN, SITES, RULES,
} from './data.js';

export const COLS = 7;
export const ROWS = 10;
const DIRS = [[1, 0], [1, -1], [0, -1], [-1, 0], [-1, 1], [0, 1]];
const BLOCKING = ['keep', 'spire', 'citadel', 'camp', 'lair'];
const WALLED = ['keep', 'spire', 'citadel'];
const SHOPS = ['village', 'sanctum', 'keep', 'spire'];

// ---------- helpers
export const key = (q, r) => `${q},${r}`;
export const parseKey = (k) => k.split(',').map(Number);
export const offsetToAxial = (col, row) => [col - Math.floor(row / 2), row];
export function neighbors(k) {
  const [q, r] = parseKey(k);
  return DIRS.map(([dq, dr]) => key(q + dq, r + dr));
}
export function distance(a, b) {
  const [aq, ar] = parseKey(a);
  const [bq, br] = parseKey(b);
  return (Math.abs(aq - bq) + Math.abs(ar - br) + Math.abs(aq + ar - bq - br)) / 2;
}

function rnd(s) {
  s.rng = (s.rng + 0x6d2b79f5) | 0;
  let t = s.rng;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  s.irrev++;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
function shuffle(s, arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rnd(s) * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}
function log(s, msg) {
  s.log.push(msg);
  if (s.log.length > 150) s.log.shift();
}
const fail = (error) => ({ ok: false, error });
const OK = { ok: true };

// ---------- derived values
export function passive(s, field) {
  return s.hero.skills.reduce((n, id) => n + ((SKILLS[id].passive || {})[field] || 0), 0);
}
export const handLimit = (s) => s.hero.handLimit + passive(s, 'hand');
export const armor = (s) => s.hero.armor + passive(s, 'armor');
export const levelFor = (renown) => 1 + LEVEL_THRESHOLDS.filter((t) => renown >= t).length;
export const nextThreshold = (s) => LEVEL_THRESHOLDS[s.hero.level - 1] ?? null;
export const standingMod = (s) => Math.max(-2, Math.min(2, Math.trunc(s.hero.standing / 2)));
export const swayAvail = (s) => Math.max(0, s.turn.sway + standingMod(s));
export const tideAspects = (s) => (s.night ? ['ember', 'frost'] : ['radiant', 'verdant']);
export const woundsInHand = (s) => s.hero.hand.filter((c) => c === 'wound').length;
export const hexAt = (s, k) => s.map[k];
export const heroHex = (s) => s.map[s.hero.pos];
const liveEnemies = (site) => (site && site.enemies ? site.enemies : []);

export function essenceAvail(s, aspect) {
  const h = s.hero;
  return (h.essence[aspect] || 0) + (h.shards[aspect] || 0)
    + (s.turn.tide && tideAspects(s).includes(aspect) ? 1 : 0);
}
function payEssence(s, aspect, n) {
  const h = s.hero;
  for (let i = 0; i < n; i++) {
    if (h.essence[aspect] > 0) h.essence[aspect]--;
    else if (s.turn.tide && tideAspects(s).includes(aspect)) s.turn.tide = false;
    else if (h.shards[aspect] > 0) h.shards[aspect]--;
    else throw new Error('essence underflow');
  }
}

// ---------- map generation
function passableTerrain(t) {
  return TERRAIN[t].cost[0] !== null;
}
function reachable(map, from, blocked = new Set()) {
  const seen = new Set([from]);
  const queue = [from];
  while (queue.length) {
    const cur = queue.pop();
    for (const n of neighbors(cur)) {
      const h = map[n];
      if (!h || seen.has(n) || blocked.has(n) || !passableTerrain(h.terrain)) continue;
      if (h.site && BLOCKING.includes(h.site.type)) continue;
      seen.add(n);
      queue.push(n);
    }
  }
  return seen;
}

function generateMap(s) {
  const map = {};
  const weights = (row) => {
    const far = 1 - row / (ROWS - 1); // 0 near start, 1 near citadel
    return [
      ['plains', 30 - 14 * far], ['forest', 22 - 6 * far], ['hills', 16],
      ['marsh', 9], ['wastes', 5 + 22 * far], ['mountain', 7 + 3 * far], ['lake', 6 - 3 * far],
    ];
  };
  for (let row = 0; row < ROWS; row++) {
    for (let col = 0; col < COLS; col++) {
      const [q, r] = offsetToAxial(col, row);
      const w = weights(row);
      let roll = rnd(s) * w.reduce((a, [, n]) => a + n, 0);
      let terrain = 'plains';
      for (const [t, n] of w) {
        if (roll < n) { terrain = t; break; }
        roll -= n;
      }
      map[key(q, r)] = { q, r, col, row, terrain, site: null, revealed: false };
    }
  }
  const start = key(...offsetToAxial(3, ROWS - 1));
  const goal = key(...offsetToAxial(3, 0));
  map[start].terrain = 'plains';
  for (const n of neighbors(start)) if (map[n]) map[n].terrain = 'plains';
  map[goal].terrain = 'wastes';
  // carve a wandering route so the citadel is always reachable
  let cur = start;
  let guard = 0;
  while (distance(cur, goal) > 1 && guard++ < 200) {
    const opts = neighbors(cur).filter((n) => map[n] && distance(n, goal) <= distance(cur, goal));
    const closer = opts.filter((n) => distance(n, goal) < distance(cur, goal));
    const pick = rnd(s) < 0.7 && closer.length ? closer : opts;
    cur = pick[Math.floor(rnd(s) * pick.length)];
    if (!passableTerrain(map[cur].terrain)) map[cur].terrain = rnd(s) < 0.5 ? 'hills' : 'wastes';
  }

  const pools = {};
  const drawEnemy = (group) => {
    if (!pools[group] || !pools[group].length) {
      pools[group] = shuffle(s, Object.values(ENEMIES).filter((x) => x.group === group).map((x) => x.id));
    }
    return pools[group].pop();
  };
  map[goal].site = {
    type: 'citadel', enemies: ['ashen_tyrant', drawEnemy('elite'), drawEnemy('elite')], seen: false,
  };

  const place = (type, rowLo, rowHi, extra = {}) => {
    const cands = shuffle(s, Object.keys(map).filter((k) => {
      const h = map[k];
      return h.row >= rowLo && h.row <= rowHi && !h.site && passableTerrain(h.terrain)
        && distance(k, start) >= 2 && distance(k, goal) >= 2;
    }));
    for (const k of cands) {
      // sites of the same kind keep apart
      if (Object.keys(map).some((o) => map[o].site && map[o].site.type === type && distance(o, k) < 2)) continue;
      if (BLOCKING.includes(type)) {
        const reach = reachable(map, start, new Set([k]));
        const allOk = Object.keys(map).every((o) => {
          const h = map[o];
          if (o === k || !h.site) return true;
          // every existing site must stay reachable (or adjacent-reachable if blocking)
          return reach.has(o) || neighbors(o).some((n) => reach.has(n));
        });
        if (!allOk || !neighbors(k).some((n) => reach.has(n))) continue;
      } else if (!reachable(map, start).has(k)) continue;
      map[k].site = { type, enemies: [], seen: false, ...extra };
      return map[k].site;
    }
    return null;
  };
  const withEnemies = (site, groups) => {
    if (site) site.enemies = groups.map(drawEnemy);
  };
  const R = ROWS - 1;
  const veinAspects = shuffle(s, [...ASPECTS]);
  // near band
  place('village', R - 3, R - 1);
  place('wayshrine', R - 3, R - 1);
  place('vein', R - 3, R - 1, { aspect: veinAspects[0] });
  withEnemies(place('camp', R - 3, R - 1), ['reaver']);
  withEnemies(place('camp', R - 3, R - 2), ['reaver']);
  withEnemies(place('barrow', R - 4, R - 2), ['horror']);
  // middle band
  withEnemies(place('keep', R - 6, R - 4), ['garrison']);
  place('sanctum', R - 6, R - 4);
  withEnemies(place('spire', R - 6, R - 4), ['arcanist']);
  withEnemies(place('camp', R - 6, R - 4), ['reaver']);
  withEnemies(place('camp', R - 6, R - 4), ['reaver']);
  place('village', R - 6, R - 4);
  place('vein', R - 6, R - 4, { aspect: veinAspects[1] });
  // far band
  withEnemies(place('ruins', 1, R - 6), ['horror', 'reaver']);
  withEnemies(place('keep', 1, R - 7), ['garrison', 'garrison']);
  withEnemies(place('lair', 1, R - 6), ['wyrm']);
  withEnemies(place('barrow', 1, R - 6), ['horror']);
  withEnemies(place('camp', 1, R - 7), ['reaver']);
  place('wayshrine', 1, R - 6);
  place('vein', 1, R - 6, { aspect: veinAspects[2] });
  s.map = map;
  s.start = start;
  s.goal = goal;
}

function reveal(s) {
  const radius = s.night ? 1 : 2;
  let any = false;
  for (const k of Object.keys(s.map)) {
    const h = s.map[k];
    const d = distance(k, s.hero.pos);
    if (!h.revealed && d <= radius) { h.revealed = true; any = true; }
    if (h.revealed && h.site && !h.site.seen) {
      const open = ['camp', 'lair'].includes(h.site.type);
      if (open || d === 0 || (d <= 1 && !s.night)) { h.site.seen = true; any = true; }
    }
  }
  if (any) s.irrev++;
}

// ---------- setup
export function newGame(seed, heroId = 'kaela') {
  const hero = HEROES[heroId];
  const s = {
    version: 1,
    seed, rng: seed | 0, irrev: 0,
    round: 1, night: false, phase: 'turn',
    map: null, start: null, goal: null,
    hero: {
      id: heroId, pos: null, level: 1, renown: 0, standing: 0,
      armor: 2, handLimit: 5, command: 1,
      deck: [], hand: [], discard: [], played: [],
      essence: { ember: 0, frost: 0, verdant: 0, radiant: 0 },
      shards: { ember: 0, frost: 0, verdant: 0, radiant: 0, ...hero.shards },
      skills: [], units: [],
    },
    turn: null, combat: null, pending: [],
    roundSkillsUsed: [],
    offers: { units: [], advanced: [], arcana: [] },
    decks: { units: [], advanced: [], arcana: [], relics: [], skills: [] },
    log: [], over: null, turnCount: 0,
    stats: { defeated: 0, conquered: 0 },
  };
  generateMap(s);
  s.hero.pos = s.start;
  const byKind = (k) => Object.values(CARDS).filter((x) => x.kind === k).map((x) => x.id);
  s.decks.advanced = shuffle(s, byKind('advanced'));
  s.decks.arcana = shuffle(s, byKind('arcana'));
  s.decks.relics = shuffle(s, byKind('relic'));
  s.decks.skills = shuffle(s, Object.keys(SKILLS));
  s.decks.units = shuffle(s, Object.keys(COMPANIONS));
  s.offers.advanced = s.decks.advanced.splice(0, 3);
  s.offers.arcana = s.decks.arcana.splice(0, 3);
  refreshUnitOffer(s);
  s.hero.deck = shuffle(s, [...STARTER_DECK, hero.card]);
  newTurn(s);
  drawUp(s);
  reveal(s);
  log(s, `${hero.name} sets out at dawn. The Ashen Citadel lies to the north.`);
  return s;
}

function refreshUnitOffer(s) {
  s.decks.units.push(...s.offers.units.filter(Boolean));
  const offer = s.decks.units.splice(0, 3);
  // a village can always recruit someone
  if (!offer.some((id) => COMPANIONS[id].sites.includes('village'))) {
    const i = s.decks.units.findIndex((id) => COMPANIONS[id].sites.includes('village'));
    if (i >= 0) { const [id] = s.decks.units.splice(i, 1); s.decks.units.push(offer.pop()); offer.push(id); }
  }
  s.offers.units = offer;
}

function newTurn(s) {
  s.turn = {
    move: 0, sway: 0, heal: 0, moved: false, acted: false, fought: false,
    cardsUsed: 0, skillsUsed: [], flat: null, tide: true, recovered: false,
  };
  s.turnCount++;
  s.roundTurn = (s.roundTurn || 0) + 1;
}

function drawUp(s, bonus = 0) {
  const h = s.hero;
  const limit = handLimit(s) + bonus;
  let drew = 0;
  while (h.hand.length < limit && h.deck.length) { h.hand.push(h.deck.shift()); drew++; }
  if (drew) s.irrev++;
}

// ---------- effects
function snareTargets(s, max) {
  if (!s.combat) return [];
  return s.combat.enemies.map((en, i) => i).filter((i) => {
    const en = s.combat.enemies[i];
    const def = ENEMIES[en.id];
    return !en.defeated && !en.snared && !en.guarded && !def.traits.includes('unyielding') && def.attack <= max;
  });
}
function livingIdx(s) {
  return s.combat ? s.combat.enemies.map((_, i) => i).filter((i) => !s.combat.enemies[i].defeated) : [];
}

export function atomOk(s, a) {
  const cb = s.combat;
  const ph = cb && cb.phase;
  if ('move' in a || 'flat' in a) return !cb && !s.turn.acted;
  if ('sway' in a) return true;
  if ('standing' in a) return !cb;
  if ('heal' in a) return woundsInHand(s) > 0 || s.hero.units.some((u) => u.wounded);
  if ('draw' in a) return s.hero.deck.length > 0;
  if ('essence' in a || 'shard' in a) return true;
  if ('ready' in a || 'readyAll' in a) return s.hero.units.some((u) => u.spent);
  // attack played early is banked for the Strike phase; block played in the Volley waits for the Guard
  if ('attack' in a || 'ranged' in a || 'siege' in a) return !!cb;
  if ('block' in a) return ph === 'volley' || ph === 'guard';
  if ('snare' in a) return (ph === 'volley' || ph === 'guard') && snareTargets(s, a.snare).length > 0;
  if ('weaken' in a) return !!cb && ph !== 'damage' && livingIdx(s).length > 0;
  if ('wound' in a) return false;
  if (a.dayBonus) return !s.night && atomOk(s, a.dayBonus);
  if (a.nightBonus) return s.night && atomOk(s, a.nightBonus);
  if (a.choice) return a.choice.some((o) => effectOk(s, o));
  return false;
}
export const effectOk = (s, atoms) => !!atoms && atoms.some((a) => atomOk(s, a));

function gainShard(s, aspect, n = 1) {
  s.hero.shards[aspect] = Math.min(RULES.shardCap, s.hero.shards[aspect] + n);
}
function addWound(s, n, toDiscard = false) {
  for (let i = 0; i < n; i++) (toDiscard ? s.hero.discard : s.hero.hand).push('wound');
}
// heal goes to hand wounds automatically unless a wounded companion gives you a choice
function spendHeal(s) {
  const h = s.hero;
  if (h.units.some((u) => u.wounded)) return;
  while (s.turn.heal > 0 && h.hand.includes('wound')) {
    h.hand.splice(h.hand.indexOf('wound'), 1);
    s.turn.heal--;
  }
}

// returns true if a pending choice was pushed (caller must stop and stash the rest)
function applyAtom(s, a) {
  if ('wound' in a) { addWound(s, a.wound); log(s, 'You take a wound from the strain.'); checkKnockout(s); return false; }
  if (!atomOk(s, a)) return false;
  const t = s.turn;
  const cb = s.combat;
  if ('move' in a) t.move += a.move;
  else if ('flat' in a) t.flat = t.flat === null ? a.flat : Math.min(t.flat, a.flat);
  else if ('sway' in a) t.sway += a.sway;
  else if ('standing' in a) s.hero.standing = Math.max(-5, Math.min(5, s.hero.standing + a.standing));
  else if ('heal' in a) { t.heal += a.heal; spendHeal(s); }
  else if ('draw' in a) {
    for (let i = 0; i < a.draw && s.hero.deck.length; i++) s.hero.hand.push(s.hero.deck.shift());
    s.irrev++;
  } else if ('essence' in a || 'shard' in a) {
    const kind = 'essence' in a ? 'essence' : 'shard';
    if (a[kind] === 'any') { s.pending.push({ type: 'aspect', kind }); return true; }
    if (kind === 'essence') s.hero.essence[a.essence] += a.n || 1;
    else gainShard(s, a.shard, a.n || 1);
  } else if ('readyAll' in a) s.hero.units.forEach((u) => { u.spent = false; });
  else if ('ready' in a) {
    const opts = s.hero.units.map((u, i) => i).filter((i) => s.hero.units[i].spent);
    if (opts.length === 1) s.hero.units[opts[0]].spent = false;
    else { s.pending.push({ type: 'ready', options: opts }); return true; }
  } else if ('attack' in a) cb.atk.melee[a.el || 'phys'] += a.attack;
  else if ('ranged' in a) cb.atk.ranged[a.el || 'phys'] += a.ranged;
  else if ('siege' in a) cb.atk.siege[a.el || 'phys'] += a.siege;
  else if ('block' in a) cb.blk[a.el || 'phys'] += a.block;
  else if ('snare' in a) {
    const opts = snareTargets(s, a.snare);
    if (opts.length === 1) s.combat.enemies[opts[0]].snared = true;
    else { s.pending.push({ type: 'snare', options: opts }); return true; }
  } else if ('weaken' in a) {
    const opts = livingIdx(s);
    if (opts.length === 1) s.combat.enemies[opts[0]].armorMod -= a.weaken;
    else { s.pending.push({ type: 'weaken', n: a.weaken, options: opts }); return true; }
  } else if (a.dayBonus) return applyAtom(s, a.dayBonus);
  else if (a.nightBonus) return applyAtom(s, a.nightBonus);
  else if (a.choice) {
    const opts = a.choice.filter((o) => effectOk(s, o));
    if (opts.length === 1) return runEffects(s, opts[0]);
    s.pending.push({ type: 'choice', options: opts });
    return true;
  }
  return false;
}

// runs atoms in order; if one needs a choice, the remainder is stored on that pending entry
function runEffects(s, atoms) {
  for (let i = 0; i < atoms.length; i++) {
    const waiting = applyAtom(s, atoms[i]);
    if (waiting) {
      const p = s.pending[s.pending.length - 1];
      p.rest = [...(p.rest || []), ...atoms.slice(i + 1)];
      return true;
    }
  }
  return false;
}

// ---------- renown and levels
function gainRenown(s, n) {
  const h = s.hero;
  h.renown += n;
  while (h.level < levelFor(h.renown)) {
    h.level++;
    if (h.level % 2 === 0) {
      if (s.offers.advanced.length) s.pending.unshift({ type: 'reward', kind: 'advanced', level: h.level });
      const skills = s.decks.skills.splice(0, 2);
      s.irrev++;
      if (skills.length) s.pending.unshift({ type: 'reward', kind: 'skill', options: skills, level: h.level });
      log(s, `Level ${h.level}! Choose a skill and an advanced card.`);
    } else {
      h.command++;
      if (h.level % 4 === 3) { h.armor++; log(s, `Level ${h.level}! Armor +1, command +1.`); }
      else { h.handLimit++; log(s, `Level ${h.level}! Hand limit +1, command +1.`); }
    }
  }
}

function relicReward(s) {
  const opts = s.decks.relics.splice(0, 2);
  s.irrev++;
  if (opts.length) s.pending.push({ type: 'reward', kind: 'relic', options: opts });
  else s.pending.push({ type: 'aspect', kind: 'shard' }, { type: 'aspect', kind: 'shard' });
}

function takeOffer(s, kind, id) {
  const offer = s.offers[kind];
  const i = offer.indexOf(id);
  if (i >= 0) offer[i] = s.decks[kind].length ? s.decks[kind].shift() : null;
  s.irrev++;
  s.offers[kind] = offer.filter(Boolean);
}

// ---------- movement
function menaced(s, k) {
  return neighbors(k).some((n) => {
    const h = s.map[n];
    return h && h.site && ['camp', 'lair'].includes(h.site.type) && h.site.enemies.length > 0;
  });
}
export function isBlocked(h) {
  if (!h || !passableTerrain(h.terrain)) return true;
  if (!h.site) return false;
  if (WALLED.includes(h.site.type)) return !h.site.conquered;
  if (['camp', 'lair'].includes(h.site.type)) return h.site.enemies.length > 0;
  return false;
}
export function moveCost(s, k) {
  const h = s.map[k];
  if (!h || !h.revealed || isBlocked(h)) return null;
  if (s.turn.flat !== null) return s.turn.flat;
  return TERRAIN[h.terrain].cost[s.night ? 1 : 0] + (menaced(s, s.hero.pos) ? 1 : 0);
}
export function moveOptions(s) {
  if (s.phase !== 'turn' || s.combat || s.pending.length || s.turn.acted) return {};
  const out = {};
  for (const n of neighbors(s.hero.pos)) {
    const cost = moveCost(s, n);
    if (cost !== null) out[n] = { cost, ok: s.turn.move >= cost };
  }
  return out;
}
export function attackOptions(s) {
  if (s.phase !== 'turn' || s.combat || s.pending.length || s.turn.acted) return [];
  const out = [];
  const here = heroHex(s);
  if (here.site && ['barrow', 'ruins'].includes(here.site.type) && here.site.enemies.length) out.push(s.hero.pos);
  for (const n of neighbors(s.hero.pos)) {
    const h = s.map[n];
    if (h && h.revealed && h.site && BLOCKING.includes(h.site.type) && h.site.enemies.length) out.push(n);
  }
  return out;
}

function enterHex(s) {
  const h = heroHex(s);
  reveal(s);
  if (h.site && h.site.type === 'wayshrine' && !h.site.visited) {
    h.site.visited = true;
    log(s, 'The wayshrine restores you.');
    runEffects(s, [{ heal: 1 }, { draw: 1 }]);
  }
}

// ---------- combat
const zero3 = () => ({ phys: 0, ember: 0, frost: 0 });
function startCombat(s, k) {
  const h = s.map[k];
  const site = h.site;
  site.seen = true;
  if (site.type === 'keep' && !site.assaulted) {
    site.assaulted = true;
    s.hero.standing = Math.max(-5, s.hero.standing - 1);
    log(s, 'Word spreads that you storm keeps. Standing -1.');
  }
  s.combat = {
    hex: k,
    walled: WALLED.includes(site.type),
    phase: 'volley',
    enemies: site.enemies.map((id) => ({
      id, armorMod: 0, defeated: false, guarded: false, snared: false, dealt: false, remaining: 0,
    })),
    atk: { ranged: zero3(), siege: zero3(), melee: zero3() },
    blk: { phys: 0, ember: 0, frost: 0, pure: 0 },
    absorbed: [],
  };
  s.turn.acted = true;
  s.turn.fought = true;
  s.turn.move = 0;
  s.irrev++;
  log(s, `Battle: ${site.enemies.map((id) => ENEMIES[id].name).join(', ')}.`);
}

export const enemyArmor = (en) => Math.max(1, ENEMIES[en.id].armor + en.armorMod);

// attack power available against a set of targets in the current phase
export function strikePower(s, targets) {
  const cb = s.combat;
  if (!cb) return 0;
  const kinds = cb.phase === 'volley' ? (cb.walled ? ['siege'] : ['ranged', 'siege']) : ['ranged', 'siege', 'melee'];
  let total = 0;
  for (const el of ['phys', 'ember', 'frost']) {
    const pts = kinds.reduce((n, kd) => n + cb.atk[kd][el], 0);
    const resisted = targets.some((i) => ENEMIES[cb.enemies[i].id].resist.includes(el));
    total += resisted ? pts / 2 : pts;
  }
  return Math.floor(total);
}
export function canTarget(s, i) {
  const cb = s.combat;
  if (!cb) return false;
  const en = cb.enemies[i];
  if (!en || en.defeated) return false;
  if (cb.phase === 'volley') return !ENEMIES[en.id].traits.includes('warded');
  return cb.phase === 'attack';
}
export function blockPower(s, i) {
  const cb = s.combat;
  const el = ENEMIES[cb.enemies[i].id].el;
  const b = cb.blk;
  if (el === 'phys') return b.phys + b.ember + b.frost + b.pure;
  const strong = el === 'ember' ? b.frost : b.ember;
  const weak = b.phys + (el === 'ember' ? b.ember : b.frost);
  return Math.floor(strong + b.pure + weak / 2);
}
export function blockNeeded(en) {
  const def = ENEMIES[en.id];
  return def.attack * (def.traits.includes('swift') ? 2 : 1);
}
const attackers = (cb) => cb.enemies.filter((en) => !en.defeated && !en.snared);

function advancePhase(s) {
  const cb = s.combat;
  if (!cb.enemies.some((en) => !en.defeated)) return endCombat(s);
  if (cb.phase === 'volley') {
    cb.phase = 'guard';
    if (!attackers(cb).length) return advancePhase(s);
    return null;
  }
  if (cb.phase === 'guard') {
    cb.blk = { phys: 0, ember: 0, frost: 0, pure: 0 };
    cb.phase = 'damage';
    for (const en of cb.enemies) {
      const def = ENEMIES[en.id];
      const hits = !en.defeated && !en.snared && !en.guarded;
      en.remaining = hits ? def.attack * (def.traits.includes('brutal') ? 2 : 1) : 0;
      en.dealt = !hits;
    }
    if (cb.enemies.every((en) => en.dealt)) return advancePhase(s);
    return null;
  }
  if (cb.phase === 'damage') {
    cb.phase = 'attack';
    return null;
  }
  return endCombat(s);
}

function endCombat(s) {
  const cb = s.combat;
  const h = s.map[cb.hex];
  const site = h.site;
  site.enemies = cb.enemies.filter((en) => !en.defeated).map((en) => en.id);
  s.combat = null;
  spendHeal(s);
  if (site.enemies.length) {
    log(s, 'You break off the fight. The survivors hold their ground.');
    return null;
  }
  site.conquered = true;
  s.stats.conquered++;
  const name = SITES[site.type].name;
  if (site.type === 'camp' || site.type === 'lair') {
    s.hero.standing = Math.min(5, s.hero.standing + 1);
    log(s, `${name} cleared. The folk of the Marches take heart. Standing +1.`);
    if (site.type === 'lair') relicReward(s);
  } else if (site.type === 'barrow') {
    log(s, 'The barrow is silent. You claim what it guarded.');
    relicReward(s);
  } else if (site.type === 'ruins') {
    log(s, 'The ruins are yours to search.');
    s.pending.push({ type: 'aspect', kind: 'shard' }, { type: 'aspect', kind: 'shard' });
    relicReward(s);
  } else if (site.type === 'keep') {
    log(s, 'The keep is yours.');
    s.hero.pos = cb.hex;
    enterHex(s);
  } else if (site.type === 'spire') {
    log(s, 'The spire falls. Its library lies open.');
    s.hero.pos = cb.hex;
    enterHex(s);
    const opts = s.offers.arcana.filter(Boolean);
    if (opts.length) s.pending.push({ type: 'reward', kind: 'arcana', options: [...opts] });
  } else if (site.type === 'citadel') {
    s.hero.pos = cb.hex;
    finish(s, true);
  }
  return null;
}

function defeat(s, i) {
  const en = s.combat.enemies[i];
  en.defeated = true;
  s.stats.defeated++;
  const def = ENEMIES[en.id];
  log(s, `${def.name} defeated. Renown +${def.renown}.`);
  gainRenown(s, def.renown);
}

function checkKnockout(s) {
  if (woundsInHand(s) >= handLimit(s)) {
    const h = s.hero;
    const rest = h.hand.filter((c) => c !== 'wound');
    if (rest.length) {
      h.discard.push(...rest);
      h.hand = h.hand.filter((c) => c === 'wound');
      log(s, 'You are knocked out! Your remaining cards are discarded.');
    }
  }
}

export function score(s) {
  return s.hero.renown + s.stats.conquered * 2 + (s.over && s.over.won ? 15 + (RULES.rounds - s.round) * 5 : 0);
}
function finish(s, won) {
  s.over = { won };
  s.phase = 'over';
  s.pending = [];
  s.over.score = score(s);
  log(s, won ? 'The Ashen Tyrant is broken. The Marches are free!' : 'The last night ends. The Tyrant’s host marches. You have failed.');
}

// ---------- card options (also used by the UI)
export function cardCost(card, mode) {
  if (card.kind === 'arcana') return mode === 'strong' ? 2 : 1;
  if (card.kind === 'relic') return 0;
  return mode === 'strong' ? 1 : 0;
}
const IMPROV = { move: [{ move: 1 }], sway: [{ sway: 1 }], attack: [{ attack: 1 }], block: [{ block: 1 }] };

export function cardOptions(s, idx) {
  const id = s.hero.hand[idx];
  const card = CARDS[id];
  if (!card || s.phase !== 'turn' || s.pending.length) return [];
  if (card.kind === 'wound') return [];
  const out = [];
  for (const mode of ['basic', 'strong']) {
    const cost = cardCost(card, mode);
    const applicable = effectOk(s, card[mode]);
    const affordable = cost === 0 || essenceAvail(s, card.aspect) >= cost;
    out.push({
      mode, cost, ok: applicable && affordable,
      partial: applicable && card[mode].some((a) => !('wound' in a) && !atomOk(s, a)),
      why: !applicable ? 'No use right now' : !affordable ? `Needs ${cost} ${card.aspect} essence` : '',
    });
  }
  if (card.kind !== 'relic') out.push({ mode: 'channel', ok: true, cost: 0, why: '' });
  for (const k of Object.keys(IMPROV)) {
    out.push({ mode: `improv:${k}`, ok: effectOk(s, IMPROV[k]), cost: 0, why: 'No use right now' });
  }
  out.push({ mode: 'discard', ok: !s.combat, cost: 0, why: 'Not during battle' });
  return out;
}

export function unitOptions(s, ui) {
  const unit = s.hero.units[ui];
  if (!unit || s.phase !== 'turn' || s.pending.length) return [];
  return COMPANIONS[unit.id].abilities.map((ab, i) => ({
    ability: i, ok: !unit.spent && !unit.wounded && effectOk(s, ab),
  }));
}

export function skillOk(s, id) {
  const sk = SKILLS[id];
  if (!sk || sk.use === 'passive' || s.phase !== 'turn' || s.pending.length) return false;
  if (!s.hero.skills.includes(id)) return false;
  if (s.turn.skillsUsed.includes(id) || s.roundSkillsUsed.includes(id)) return false;
  return effectOk(s, sk.effect);
}

export function shopHere(s) {
  const site = heroHex(s).site;
  if (!site || !SHOPS.includes(site.type)) return null;
  if (WALLED.includes(site.type) && !site.conquered) return null;
  return site.type;
}
export function shopOptions(s) {
  const type = shopHere(s);
  if (!type || s.phase !== 'turn' || s.combat || s.pending.length || s.turn.fought || s.turn.recovered) return null;
  const sway = swayAvail(s);
  const res = { type, sway, recruits: [], cards: [], heal: null };
  for (const id of s.offers.units.filter(Boolean)) {
    const def = COMPANIONS[id];
    if (!def.sites.includes(type)) continue;
    const full = s.hero.units.length >= s.hero.command;
    res.recruits.push({ id, cost: def.cost, ok: sway >= def.cost && !full, why: full ? 'No free command slot' : sway < def.cost ? 'Not enough Sway' : '' });
  }
  if (type === 'sanctum') for (const id of s.offers.advanced) res.cards.push({ id, kind: 'advanced', cost: RULES.advancedCost, ok: sway >= RULES.advancedCost });
  if (type === 'spire') for (const id of s.offers.arcana) res.cards.push({ id, kind: 'arcana', cost: RULES.arcanaCost, ok: sway >= RULES.arcanaCost });
  if (type === 'village' || type === 'sanctum') {
    const cost = type === 'village' ? RULES.villageHeal : RULES.sanctumHeal;
    const need = woundsInHand(s) > 0 || s.hero.units.some((u) => u.wounded);
    res.heal = { cost, ok: need && sway >= cost };
  }
  return res;
}

const atStartOfTurn = (s) => s.turn.cardsUsed === 0 && !s.turn.moved && !s.turn.acted;
export function canEndRound(s) {
  return s.phase === 'turn' && !s.combat && !s.pending.length && s.hero.deck.length === 0 && atStartOfTurn(s);
}
export function canRecover(s) {
  return s.phase === 'turn' && !s.combat && !s.pending.length && !s.turn.acted && !s.turn.moved
    && !s.turn.recovered && woundsInHand(s) > 0;
}
export function endTurnBlocker(s) {
  if (s.phase !== 'turn') return 'Game over';
  if (s.combat) return 'Finish the battle first';
  if (s.pending.length) return 'Resolve the choice first';
  const nonWounds = s.hero.hand.filter((c) => c !== 'wound').length;
  if (s.turn.cardsUsed === 0 && !s.turn.recovered && s.hero.hand.length > 0) {
    if (nonWounds) return 'Play or discard at least one card';
    if (canRecover(s)) return 'Recover first';
  }
  return null;
}

// ---------- actions
function useCard(s, idx, dest = 'played') {
  const [id] = s.hero.hand.splice(idx, 1);
  if (dest === 'played') s.hero.played.push(id);
  else if (dest === 'discard') s.hero.discard.push(id);
  s.turn.cardsUsed++;
  return id;
}

const ACTIONS = {
  play(s, { index, mode }) {
    const opt = cardOptions(s, index).find((o) => o.mode === mode);
    if (!opt) return fail('That card cannot be used that way');
    if (!opt.ok) return fail(opt.why || 'Not possible');
    const card = CARDS[s.hero.hand[index]];
    if (mode === 'basic' || mode === 'strong') {
      payEssence(s, card.aspect, opt.cost);
      const unleash = card.kind === 'relic' && mode === 'strong';
      useCard(s, index, unleash ? 'gone' : 'played');
      log(s, `${card.name}${mode === 'strong' ? (unleash ? ' unleashed' : ' (empowered)') : ''}.`);
      runEffects(s, card[mode]);
    } else if (mode === 'channel') {
      useCard(s, index);
      s.hero.essence[card.aspect]++;
      log(s, `Channelled ${card.name} for ${card.aspect} essence.`);
    } else if (mode === 'discard') {
      useCard(s, index);
      log(s, `Discarded ${card.name}.`);
    } else {
      useCard(s, index);
      runEffects(s, IMPROV[mode.split(':')[1]]);
    }
    return OK;
  },
  unit(s, { index, ability }) {
    const opt = unitOptions(s, index).find((o) => o.ability === ability);
    if (!opt || !opt.ok) return fail('That companion cannot do that now');
    const unit = s.hero.units[index];
    unit.spent = true;
    log(s, `${COMPANIONS[unit.id].name} act.`);
    runEffects(s, COMPANIONS[unit.id].abilities[ability]);
    return OK;
  },
  skill(s, { id }) {
    if (!skillOk(s, id)) return fail('That skill cannot be used now');
    (SKILLS[id].use === 'round' ? s.roundSkillsUsed : s.turn.skillsUsed).push(id);
    log(s, `${SKILLS[id].name}.`);
    runEffects(s, SKILLS[id].effect);
    return OK;
  },
  healUnit(s, { index }) {
    const unit = s.hero.units[index];
    if (!unit || !unit.wounded) return fail('Nothing to heal');
    if (s.turn.heal < 1) return fail('No healing available');
    s.turn.heal--;
    unit.wounded = false;
    return OK;
  },
  healWound(s) {
    if (s.turn.heal < 1) return fail('No healing available');
    const i = s.hero.hand.indexOf('wound');
    if (i < 0) return fail('No wound in hand');
    s.hero.hand.splice(i, 1);
    s.turn.heal--;
    return OK;
  },
  dismiss(s, { index }) {
    if (s.combat || !s.hero.units[index]) return fail('Cannot dismiss now');
    const [u] = s.hero.units.splice(index, 1);
    log(s, `${COMPANIONS[u.id].name} leave your service.`);
    return OK;
  },
  move(s, { to }) {
    const opt = moveOptions(s)[to];
    if (!opt) return fail('You cannot move there');
    if (!opt.ok) return fail(`Needs ${opt.cost} Move`);
    s.turn.move -= opt.cost;
    s.turn.moved = true;
    s.hero.pos = to;
    enterHex(s);
    return OK;
  },
  attack(s, { hex }) {
    if (!attackOptions(s).includes(hex)) return fail('Nothing to attack there');
    startCombat(s, hex);
    return OK;
  },
  strike(s, { targets }) {
    const cb = s.combat;
    if (!cb || !['volley', 'attack'].includes(cb.phase)) return fail('Not the time to strike');
    if (!Array.isArray(targets) || !targets.length || new Set(targets).size !== targets.length) return fail('Choose targets');
    if (!targets.every((i) => canTarget(s, i))) return fail('Invalid target');
    const need = targets.reduce((n, i) => n + enemyArmor(cb.enemies[i]), 0);
    const have = strikePower(s, targets);
    if (have < need) return fail(`Needs ${need} attack, you have ${have}`);
    const kinds = cb.phase === 'volley' ? (cb.walled ? ['siege'] : ['ranged', 'siege']) : ['ranged', 'siege', 'melee'];
    for (const kd of kinds) cb.atk[kd] = zero3();
    targets.forEach((i) => defeat(s, i));
    if (!cb.enemies.some((en) => !en.defeated)) endCombat(s);
    return OK;
  },
  guard(s, { enemy }) {
    const cb = s.combat;
    if (!cb || cb.phase !== 'guard') return fail('Not the Guard phase');
    const en = cb.enemies[enemy];
    if (!en || en.defeated || en.snared || en.guarded) return fail('Nothing to guard against');
    const need = blockNeeded(en);
    const have = blockPower(s, enemy);
    if (have < need) return fail(`Needs ${need} block, you have ${have}`);
    en.guarded = true;
    cb.blk = { phys: 0, ember: 0, frost: 0, pure: 0 };
    log(s, `${ENEMIES[en.id].name} guarded.`);
    return OK;
  },
  assign(s, { enemy, target }) {
    const cb = s.combat;
    if (!cb || cb.phase !== 'damage') return fail('Not the Damage phase');
    const en = cb.enemies[enemy];
    if (!en || en.dealt) return fail('No damage to assign');
    const def = ENEMIES[en.id];
    const venom = def.traits.includes('venom');
    if (target === 'hero') {
      // a single foe can at worst knock you out
      const wounds = Math.min(handLimit(s), Math.ceil(en.remaining / armor(s)));
      addWound(s, wounds);
      if (venom) addWound(s, wounds, true);
      en.remaining = 0;
      en.dealt = true;
      log(s, `${def.name} wounds you${wounds > 1 ? ` ${wounds} times` : ''}${venom ? ' with venom' : ''}.`);
      checkKnockout(s);
    } else {
      const unit = s.hero.units[target];
      if (!unit || unit.wounded || cb.absorbed.includes(target)) return fail('That companion cannot take the blow');
      const cdef = COMPANIONS[unit.id];
      en.remaining -= cdef.armor;
      if (venom) {
        s.hero.units.splice(target, 1);
        cb.absorbed = cb.absorbed.map((i) => (i > target ? i - 1 : i));
        log(s, `${cdef.name} are slain by ${def.name}'s venom.`);
      } else {
        unit.wounded = true;
        cb.absorbed.push(target);
        log(s, `${cdef.name} take the blow from ${def.name}.`);
      }
      if (en.remaining <= 0) { en.remaining = 0; en.dealt = true; }
    }
    if (cb.enemies.every((x) => x.dealt)) advancePhase(s);
    return OK;
  },
  next(s) {
    const cb = s.combat;
    if (!cb) return fail('No battle');
    if (cb.phase === 'damage') return fail('Assign all damage first');
    advancePhase(s);
    return OK;
  },
  recruit(s, { id }) {
    const shop = shopOptions(s);
    const opt = shop && shop.recruits.find((r) => r.id === id);
    if (!opt) return fail('Not on offer here');
    if (!opt.ok) return fail(opt.why);
    s.turn.sway -= opt.cost;
    s.turn.acted = true;
    s.turn.move = 0;
    s.offers.units[s.offers.units.indexOf(id)] = null;
    s.hero.units.push({ id, spent: false, wounded: false });
    log(s, `${COMPANIONS[id].name} join you.`);
    return OK;
  },
  buy(s, { id }) {
    const shop = shopOptions(s);
    const opt = shop && shop.cards.find((r) => r.id === id);
    if (!opt) return fail('Not on offer here');
    if (!opt.ok) return fail('Not enough Sway');
    s.turn.sway -= opt.cost;
    s.turn.acted = true;
    s.turn.move = 0;
    takeOffer(s, opt.kind, id);
    s.hero.deck.unshift(id);
    log(s, `You acquire ${CARDS[id].name}.`);
    return OK;
  },
  buyHeal(s) {
    const shop = shopOptions(s);
    if (!shop || !shop.heal) return fail('No healer here');
    if (!shop.heal.ok) return fail('Not enough Sway, or nothing to heal');
    s.turn.sway -= shop.heal.cost;
    s.turn.acted = true;
    s.turn.move = 0;
    s.turn.heal++;
    spendHeal(s);
    return OK;
  },
  recover(s, { index }) {
    if (!canRecover(s)) return fail('You cannot recover now');
    const h = s.hero;
    const nonWounds = h.hand.filter((c) => c !== 'wound').length;
    if (nonWounds) {
      if (!h.hand[index] || h.hand[index] === 'wound') return fail('Choose a card to give up');
      h.discard.push(h.hand.splice(index, 1)[0]);
      const n = woundsInHand(s);
      h.hand = h.hand.filter((c) => c !== 'wound');
      for (let i = 0; i < n; i++) h.discard.push('wound');
      log(s, `You rest, setting aside ${n} wound${n > 1 ? 's' : ''}.`);
    } else {
      const n = Math.min(2, h.hand.length);
      for (let i = 0; i < n; i++) h.discard.push(h.hand.pop());
      log(s, 'Battered, you can only catch your breath.');
    }
    s.turn.recovered = true;
    s.turn.acted = true;
    s.turn.move = 0;
    return OK;
  },
  choose(s, { index }) {
    const p = s.pending[s.pending.length - 1];
    if (!p) return fail('Nothing to choose');
    const options = pendingOptions(s, p);
    if (options.length === 0) { s.pending.pop(); return OK; }
    if (!Number.isInteger(index) || index < 0 || index >= options.length) return fail('Invalid choice');
    p.options = options;
    s.pending.pop();
    const rest = p.rest || [];
    if (p.type === 'choice') {
      runEffects(s, [...p.options[index], ...rest]);
      return OK;
    }
    if (p.type === 'aspect') {
      const a = ASPECTS[index];
      if (p.kind === 'essence') s.hero.essence[a]++;
      else gainShard(s, a);
    } else if (p.type === 'ready') s.hero.units[p.options[index]].spent = false;
    else if (p.type === 'snare') {
      const en = s.combat.enemies[p.options[index]];
      en.snared = true;
      log(s, `${ENEMIES[en.id].name} is snared and cannot attack.`);
    } else if (p.type === 'weaken') s.combat.enemies[p.options[index]].armorMod -= p.n;
    else if (p.type === 'reward') {
      const id = p.options[index];
      if (p.kind === 'skill') {
        s.hero.skills.push(id);
        s.decks.skills.push(...p.options.filter((x) => x !== id));
        log(s, `Skill learned: ${SKILLS[id].name}.`);
      } else {
        if (p.kind === 'relic') s.decks.relics.push(...p.options.filter((x) => x !== id));
        else takeOffer(s, p.kind, id);
        s.hero.deck.unshift(id);
        s.irrev++;
        log(s, `You gain ${CARDS[id].name}. It goes on top of your deck.`);
      }
    }
    if (rest.length) runEffects(s, rest);
    return OK;
  },
  endTurn(s) {
    const why = endTurnBlocker(s);
    if (why) return fail(why);
    const h = s.hero;
    const here = heroHex(s);
    if (here.site && here.site.type === 'vein') {
      gainShard(s, here.site.aspect);
      log(s, `The vein yields a ${here.site.aspect} shard.`);
    }
    h.discard.push(...h.played);
    h.played = [];
    h.essence = { ember: 0, frost: 0, verdant: 0, radiant: 0 };
    const bonus = here.site && here.site.type === 'keep' && here.site.conquered ? 1 : 0;
    if (s.roundTurn >= RULES.turnsPerRound) {
      log(s, s.night ? 'The night is spent.' : 'The day is spent.');
      doEndRound(s, bonus);
      return OK;
    }
    newTurn(s);
    drawUp(s, bonus);
    return OK;
  },
  endRound(s) {
    if (!canEndRound(s)) return fail('You can only end the round at the start of a turn with an empty deck');
    doEndRound(s);
    return OK;
  },
};

function doEndRound(s, bonus = 0) {
  {
    const h = s.hero;
    if (s.round >= RULES.rounds) { finish(s, false); return; }
    s.round++;
    s.night = !s.night;
    h.deck = shuffle(s, [...h.deck, ...h.hand, ...h.discard, ...h.played]);
    h.hand = [];
    h.discard = [];
    h.played = [];
    h.units.forEach((u) => { u.spent = false; });
    s.roundSkillsUsed = [];
    s.roundTurn = 0;
    h.essence = { ember: 0, frost: 0, verdant: 0, radiant: 0 };
    refreshUnitOffer(s);
    if (s.decks.advanced.length && s.offers.advanced.length) {
      s.decks.advanced.push(s.offers.advanced.shift());
      s.offers.advanced.push(s.decks.advanced.shift());
    }
    newTurn(s);
    drawUp(s, bonus);
    reveal(s);
    log(s, s.night ? `Night falls (round ${s.round} of ${RULES.rounds}).` : `Dawn breaks (round ${s.round} of ${RULES.rounds}).`);
  }
}

// the options of a pending choice; level-up card rewards read the offer as it stands now
export function pendingOptions(s, p) {
  if (p.type === 'aspect') return ASPECTS;
  if (p.type === 'reward' && p.kind === 'advanced' && !p.options) return s.offers.advanced.filter(Boolean);
  return p.options;
}

export function act(s, action) {
  if (!action || !ACTIONS[action.type]) return fail('Unknown action');
  if (s.phase === 'over') return fail('The game is over');
  if (s.pending.length && action.type !== 'choose') return fail('Resolve the choice first');
  const res = ACTIONS[action.type](s, action);
  return res;
}

// ---------- text
const EL = { phys: '', ember: 'Ember ', frost: 'Frost ', pure: 'Pure ' };
export function atomText(a) {
  if ('move' in a) return `Move ${a.move}`;
  if ('flat' in a) return `every hex costs ${a.flat} Move this turn`;
  if ('sway' in a) return `Sway ${a.sway}`;
  if ('standing' in a) return `Standing +${a.standing}`;
  if ('heal' in a) return `Heal ${a.heal}`;
  if ('draw' in a) return `draw ${a.draw}`;
  if ('essence' in a) return `gain ${a.essence === 'any' ? 'an' : a.essence} essence`;
  if ('shard' in a) return `gain ${a.shard === 'any' ? 'a' : a.shard} shard`;
  if ('readyAll' in a) return 'ready all companions';
  if ('ready' in a) return 'ready a companion';
  if ('attack' in a) return `${EL[a.el || 'phys']}Attack ${a.attack}`;
  if ('ranged' in a) return `${EL[a.el || 'phys']}Ranged ${a.ranged}`;
  if ('siege' in a) return `${EL[a.el || 'phys']}Siege ${a.siege}`;
  if ('block' in a) return `${EL[a.el || 'phys']}Block ${a.block}`;
  if ('snare' in a) return a.snare >= 99 ? 'snare a foe (it cannot attack)' : `snare a foe with attack ${a.snare} or less`;
  if ('weaken' in a) return `a foe gets Armor -${a.weaken}`;
  if ('wound' in a) return `take ${a.wound} wound`;
  if (a.dayBonus) return `by day, ${atomText(a.dayBonus)} more`.replace(/(\w+) (\d+) more/, '+$2 $1');
  if (a.nightBonus) return `by night, ${atomText(a.nightBonus)} more`.replace(/(\w+) (\d+) more/, '+$2 $1');
  if (a.choice) return a.choice.map(effectText).join(' or ');
  return '';
}
export function effectText(atoms) {
  if (!atoms) return '';
  const t = atoms.map(atomText).join(', ');
  return t.charAt(0).toUpperCase() + t.slice(1);
}
