// Bots for testing: legal-action enumeration, a random player and a heuristic player.
import * as E from '../public/engine/engine.js';
import { CARDS, ENEMIES, COMPANIONS, ASPECTS } from '../public/engine/data.js';

export function legalActions(s) {
  const out = [];
  if (s.phase === 'over') return out;
  if (s.pending.length) {
    const p = s.pending[s.pending.length - 1];
    const n = p.type === 'aspect' ? ASPECTS.length : p.options.length;
    for (let i = 0; i < n; i++) out.push({ type: 'choose', index: i });
    return out;
  }
  s.hero.hand.forEach((_, index) => {
    for (const o of E.cardOptions(s, index)) if (o.ok) out.push({ type: 'play', index, mode: o.mode });
  });
  s.hero.units.forEach((_, index) => {
    for (const o of E.unitOptions(s, index)) if (o.ok) out.push({ type: 'unit', index, ability: o.ability });
  });
  for (const id of s.hero.skills) if (E.skillOk(s, id)) out.push({ type: 'skill', id });
  const cb = s.combat;
  if (cb) {
    if (cb.phase === 'volley' || cb.phase === 'attack') {
      const ts = cb.enemies.map((_, i) => i).filter((i) => E.canTarget(s, i));
      for (let mask = 1; mask < 1 << ts.length; mask++) {
        const targets = ts.filter((_, j) => mask & (1 << j));
        const need = targets.reduce((n, i) => n + E.enemyArmor(cb.enemies[i]), 0);
        if (E.strikePower(s, targets) >= need) out.push({ type: 'strike', targets });
      }
    }
    if (cb.phase === 'guard') {
      cb.enemies.forEach((en, i) => {
        if (!en.defeated && !en.snared && !en.guarded && E.blockPower(s, i) >= E.blockNeeded(en)) out.push({ type: 'guard', enemy: i });
      });
    }
    if (cb.phase === 'damage') {
      cb.enemies.forEach((en, i) => {
        if (en.dealt) return;
        out.push({ type: 'assign', enemy: i, target: 'hero' });
        s.hero.units.forEach((u, ui) => {
          if (!u.wounded && !cb.absorbed.includes(ui)) out.push({ type: 'assign', enemy: i, target: ui });
        });
      });
    } else out.push({ type: 'next' });
    return out;
  }
  const moves = E.moveOptions(s);
  for (const to of Object.keys(moves)) if (moves[to].ok) out.push({ type: 'move', to });
  for (const hex of E.attackOptions(s)) out.push({ type: 'attack', hex });
  const shop = E.shopOptions(s);
  if (shop) {
    for (const r of shop.recruits) if (r.ok) out.push({ type: 'recruit', id: r.id });
    for (const c of shop.cards) if (c.ok) out.push({ type: 'buy', id: c.id });
    if (shop.heal && shop.heal.ok) out.push({ type: 'buyHeal' });
  }
  s.hero.units.forEach((u, index) => { if (u.wounded && s.turn.heal > 0) out.push({ type: 'healUnit', index }); });
  if (E.canRecover(s)) {
    const idx = s.hero.hand.findIndex((c) => c !== 'wound');
    out.push({ type: 'recover', index: Math.max(0, idx) });
  }
  if (!E.endTurnBlocker(s)) out.push({ type: 'endTurn' });
  if (E.canEndRound(s)) out.push({ type: 'endRound' });
  return out;
}

export function mulberry(seed) {
  let a = seed | 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function must(s, action) {
  const res = E.act(s, action);
  if (!res.ok) throw new Error(`bot made illegal action ${JSON.stringify(action)}: ${res.error}`);
}

// ---- heuristic player
const atomVal = (atoms, keys) => (atoms || []).reduce((n, a) => {
  if (a.choice) return n + Math.max(...a.choice.map((o) => atomVal(o, keys)));
  for (const k of keys) if (k in a) return n + (typeof a[k] === 'number' ? a[k] : 1);
  return n;
}, 0);

function resolvePending(s, want) {
  while (s.pending.length && s.phase !== 'over') {
    const p = s.pending[s.pending.length - 1];
    let index = 0;
    if (p.type === 'choice') {
      const scores = p.options.map((o) => atomVal(o, want));
      index = scores.indexOf(Math.max(...scores));
    } else if (p.type === 'snare') {
      const sc = p.options.map((i) => ENEMIES[s.combat.enemies[i].id].attack);
      index = sc.indexOf(Math.max(...sc));
    } else if (p.type === 'aspect') {
      index = ASPECTS.indexOf(s.wantAspect || 'ember');
      if (index < 0) index = 0;
    }
    must(s, { type: 'choose', index });
  }
}

// play cards/units that produce any of `keys` until done(s) is true
function produce(s, keys, done, { improv = null, useStrong = true } = {}) {
  for (let guard = 0; guard < 40 && !done(s) && s.phase !== 'over'; guard++) {
    let best = null;
    s.hero.hand.forEach((id, index) => {
      const card = CARDS[id];
      for (const o of E.cardOptions(s, index)) {
        if (!o.ok || !['basic', 'strong'].includes(o.mode)) continue;
        if (o.mode === 'strong' && (!useStrong || card.kind === 'relic')) continue;
        const v = atomVal(card[o.mode], keys);
        if (v > 0 && (!best || v > best.v)) best = { v, action: { type: 'play', index, mode: o.mode } };
      }
    });
    s.hero.units.forEach((u, index) => {
      for (const o of E.unitOptions(s, index)) {
        if (!o.ok) continue;
        const v = atomVal(COMPANIONS[u.id].abilities[o.ability], keys);
        if (v > 0 && (!best || v >= best.v)) best = { v, action: { type: 'unit', index, ability: o.ability } };
      }
    });
    for (const id of s.hero.skills) {
      if (E.skillOk(s, id) && !best) best = { v: 1, action: { type: 'skill', id } };
    }
    if (!best && improv) {
      const index = s.hero.hand.findIndex((c, i) => E.cardOptions(s, i).some((o) => o.mode === `improv:${improv}` && o.ok));
      if (index >= 0) best = { v: 1, action: { type: 'play', index, mode: `improv:${improv}` } };
    }
    if (!best) return;
    must(s, best.action);
    resolvePending(s, keys);
  }
}

function fight(s) {
  const cb = () => s.combat;
  const living = () => cb().enemies.map((_, i) => i).filter((i) => !cb().enemies[i].defeated);
  const bestStrike = () => {
    const ts = living().filter((i) => E.canTarget(s, i));
    let best = null;
    for (let mask = 1; mask < 1 << ts.length; mask++) {
      const targets = ts.filter((_, j) => mask & (1 << j));
      const need = targets.reduce((n, i) => n + E.enemyArmor(cb().enemies[i]), 0);
      const gain = targets.reduce((n, i) => n + ENEMIES[cb().enemies[i].id].renown, 0);
      if (E.strikePower(s, targets) >= need && (!best || gain > best.gain)) best = { gain, targets };
    }
    return best;
  };
  // volley
  produce(s, ['ranged', 'siege', 'snare'], () => !s.combat || false);
  while (s.combat && s.combat.phase === 'volley') {
    const b = bestStrike();
    if (b) { must(s, { type: 'strike', targets: b.targets }); resolvePending(s, ['attack']); } else must(s, { type: 'next' });
  }
  // guard: biggest threat first
  while (s.combat && s.combat.phase === 'guard') {
    const threats = living().filter((i) => !cb().enemies[i].snared && !cb().enemies[i].guarded)
      .sort((a, b) => ENEMIES[cb().enemies[b].id].attack - ENEMIES[cb().enemies[a].id].attack);
    let guarded = false;
    for (const i of threats) {
      const need = E.blockNeeded(cb().enemies[i]);
      const snap = structuredClone(s);
      produce(s, ['block'], () => E.blockPower(s, i) >= need, { improv: 'block' });
      if (E.blockPower(s, i) >= need) { must(s, { type: 'guard', enemy: i }); guarded = true; break; }
      // could not block it: undo the wasted cards
      for (const k of Object.keys(s)) delete s[k];
      Object.assign(s, snap);
    }
    if (!guarded) must(s, { type: 'next' });
  }
  while (s.combat && s.combat.phase === 'damage') {
    const i = cb().enemies.findIndex((en) => !en.dealt);
    const venom = ENEMIES[cb().enemies[i].id].traits.includes('venom');
    const ui = s.hero.units.findIndex((u, k) => !u.wounded && !cb().absorbed.includes(k));
    must(s, { type: 'assign', enemy: i, target: ui >= 0 && !venom ? ui : 'hero' });
    resolvePending(s, ['attack']);
  }
  if (s.combat && s.combat.phase === 'attack') {
    produce(s, ['attack', 'ranged', 'siege'], () => !s.combat, { improv: 'attack' });
    while (s.combat && s.combat.phase === 'attack') {
      const b = bestStrike();
      if (b) { must(s, { type: 'strike', targets: b.targets }); resolvePending(s, ['attack']); } else must(s, { type: 'next' });
    }
  }
  resolvePending(s, ['attack']);
}

function pathStep(s, goalTest) {
  // BFS over the true map (the bot peeks), returns first step towards nearest goal hex
  const start = s.hero.pos;
  const prev = { [start]: null };
  const queue = [start];
  while (queue.length) {
    const cur = queue.shift();
    if (cur !== start && goalTest(cur)) {
      let k = cur;
      while (prev[k] !== start) k = prev[k];
      return { step: k, target: cur };
    }
    for (const n of E.neighbors(cur)) {
      if (n in prev || !s.map[n]) continue;
      if (goalTest(n)) { prev[n] = cur; queue.push(n); continue; }
      if (E.isBlocked(s.map[n])) continue;
      prev[n] = cur;
      queue.push(n);
    }
  }
  return null;
}

function strength(s) {
  // rough attack the deck can muster in a turn
  return 3 + s.hero.level * 1.6 + s.hero.units.length * 2.5;
}

export function smartTurn(s) {
  resolvePending(s, ['attack']);
  if (s.phase === 'over') return;
  if (s.combat) { fight(s); return; }
  if (E.canEndRound(s) && s.hero.hand.filter((c) => c !== 'wound').length < 2) { must(s, { type: 'endRound' }); return; }
  if (E.canRecover(s) && E.woundsInHand(s) >= 2) {
    const index = s.hero.hand.findIndex((c) => c !== 'wound');
    must(s, { type: 'recover', index: Math.max(0, index) });
    must(s, { type: 'endTurn' });
    return;
  }
  const shop0 = E.shopOptions(s);
  const tough = (k) => {
    const site = s.map[k].site;
    return site.enemies.reduce((n, id) => n + ENEMIES[id].armor + ENEMIES[id].attack / 2, 0);
  };
  const lateGame = s.round >= 5;
  const isTarget = (k) => {
    const h = s.map[k];
    if (!h || !h.site) return false;
    if (h.site.type === 'citadel') return lateGame || strength(s) >= 16;
    if (h.site.enemies.length) return !lateGame && tough(k) <= strength(s);
    if (h.site.type === 'wayshrine' && !h.site.visited) return E.distance(k, s.hero.pos) <= 2;
    if (['village', 'keep', 'sanctum'].includes(h.site.type) && k !== s.hero.pos) {
      return !lateGame && s.hero.units.length < s.hero.command && !s.visitedShops?.includes(k);
    }
    return false;
  };
  // shop if here
  if (shop0 && s.hero.units.length < s.hero.command) {
    produce(s, ['sway'], () => false, { useStrong: true });
    const shop = E.shopOptions(s);
    const pick = shop.recruits.filter((r) => r.ok).sort((a, b) => b.cost - a.cost)[0];
    if (pick) must(s, { type: 'recruit', id: pick.id });
    (s.visitedShops ||= []).push(s.hero.pos);
  }
  // attack only what this hand can actually hurt
  const potential = () => s.hero.hand.reduce((n, id) => {
    if (id === 'wound') return n;
    const c = CARDS[id];
    return n + Math.max(1, atomVal(c.basic, ['attack', 'ranged', 'siege']), c.kind === 'basic' && E.essenceAvail(s, c.aspect) ? atomVal(c.strong, ['attack', 'ranged', 'siege']) - 1 : 0);
  }, 0) + s.hero.units.reduce((n, u) => n + (u.spent || u.wounded ? 0 : Math.max(...COMPANIONS[u.id].abilities.map((ab) => atomVal(ab, ['attack', 'ranged', 'siege'])))), 0);
  const killable = (k) => {
    const need = Math.min(...s.map[k].site.enemies.map((id) => ENEMIES[id].armor * (ENEMIES[id].resist.includes('phys') ? 2 : 1)));
    return potential() >= need + (s.map[k].site.type === 'citadel' ? 0 : 1);
  };
  for (let hop = 0; hop < 8 && !s.turn.acted && s.phase !== 'over'; hop++) {
    const atk = E.attackOptions(s).filter(isTarget).filter(killable);
    if (atk.length) { must(s, { type: 'attack', hex: atk[0] }); fight(s); break; }
    const path = pathStep(s, isTarget) || pathStep(s, (k) => s.map[k].site && s.map[k].site.type === 'citadel');
    if (!path) break;
    const target = s.map[path.step];
    if (E.isBlocked(target)) break; // adjacent to something we chose not to attack
    const cost = E.moveCost(s, path.step);
    if (cost === null) break;
    produce(s, ['move'], () => s.turn.move >= cost, { improv: 'move', useStrong: true });
    if (s.turn.move < cost) break;
    must(s, { type: 'move', to: path.step });
    resolvePending(s, ['move']);
    (s.visitedShops ||= []);
    if (E.shopHere(s) && s.hero.units.length < s.hero.command && !s.visitedShops.includes(s.hero.pos)) {
      produce(s, ['sway'], () => false);
      const shop = E.shopOptions(s);
      const pick = shop && shop.recruits.filter((r) => r.ok).sort((a, b) => b.cost - a.cost)[0];
      if (pick) must(s, { type: 'recruit', id: pick.id });
      s.visitedShops.push(s.hero.pos);
      break;
    }
  }
  resolvePending(s, ['attack']);
  if (s.phase === 'over') return;
  // heal with whatever is left
  produce(s, ['heal'], () => E.woundsInHand(s) === 0);
  if (E.endTurnBlocker(s)) {
    const index = s.hero.hand.findIndex((c) => c !== 'wound');
    if (index >= 0) must(s, { type: 'play', index, mode: 'discard' });
    else if (E.canRecover(s)) must(s, { type: 'recover', index: 0 });
  }
  must(s, { type: 'endTurn' });
}

export function playSmart(seed, hero = 'kaela', maxTurns = 400) {
  const s = E.newGame(seed, hero);
  let n = 0;
  while (s.phase !== 'over' && n++ < maxTurns) smartTurn(s);
  return s;
}
