// Emberwake interface. Computes no rules: it asks the engine what is legal and shows it.
import * as E from './engine/engine.js';
import {
  CARDS, HEROES, ENEMIES, COMPANIONS, SKILLS, TERRAIN, SITES, RULES, ASPECTS, ASPECT_INFO, TRAIT_INFO,
} from './engine/data.js';
import { GLYPHS, glyph } from './art.js';

const SAVE_KEY = 'emberwake.save.v1';
const $ = (sel) => document.querySelector(sel);
const esc = (t) => String(t).replace(/[&<>"]/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]));
const cap = (t) => t.charAt(0).toUpperCase() + t.slice(1);

let G = null; // game state
let VERSION = 'dev';
let history = []; // undo snapshots (JSON) since the last hidden-information change
const ui = { sheet: null, sel: [], guardSel: null, heroPick: 'kaela', view: null, lastPos: null };

// ---------- persistence and dispatch
function save() {
  try {
    if (G) localStorage.setItem(SAVE_KEY, JSON.stringify(G));
    else localStorage.removeItem(SAVE_KEY);
  } catch { /* storage may be unavailable */ }
}
function loadSave() {
  try {
    const s = JSON.parse(localStorage.getItem(SAVE_KEY) || 'null');
    return s && s.version === 1 ? s : null;
  } catch { return null; }
}
let toastTimer = 0;
function toast(msg) {
  const t = $('#toast');
  t.textContent = msg;
  t.classList.add('on');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('on'), 2200);
}
function dispatch(action, { keepSheet = false } = {}) {
  const before = JSON.stringify(G);
  const irrev = G.irrev;
  const lastLog = G.log[G.log.length - 1];
  const res = E.act(G, action);
  if (!res.ok) { toast(res.error); return false; }
  const newLog = G.log[G.log.length - 1];
  if (newLog !== lastLog && !['play', 'unit', 'skill'].includes(action.type)) toast(newLog);
  if (G.irrev !== irrev) history = [];
  else history.push(before);
  if (!keepSheet) ui.sheet = null;
  save();
  render();
  return true;
}
function undo() {
  if (!history.length) { toast('Nothing to undo (new information was revealed)'); return; }
  G = JSON.parse(history.pop());
  ui.sheet = null;
  save();
  render();
}

// ---------- small render helpers
const dot = (aspect) => `<span class="dot c-${aspect}"></span>`;
const dia = (aspect) => `<span class="dia c-${aspect}"></span>`;
const elClass = (el) => (el && el !== 'phys' ? `t-${el}` : '');

function cardHTML(id, { size = '', attrs = '', dim = false } = {}) {
  const c = CARDS[id];
  if (!c) return '';
  const mark = { advanced: '▲', arcana: '✦', relic: '◆' }[c.kind] || '';
  if (c.kind === 'wound') {
    return `<div class="card a-wound ${size}" ${attrs}><div class="c-name">Wound</div><div class="c-art">${glyph('wound')}</div><div class="c-box c-strong">Clogs your hand. Heal or Recover.</div></div>`;
  }
  const basicCost = E.cardCost(c, 'basic');
  const strongCost = E.cardCost(c, 'strong');
  const pips = (n) => '<span class="pipc"></span>'.repeat(n);
  const strongLead = c.kind === 'relic' ? '<b>Unleash:</b> ' : pips(strongCost);
  return `<div class="card a-${c.aspect} ${size} ${dim ? 'dim' : ''}" ${attrs}>
    <div class="c-name">${esc(c.name)}</div><span class="c-kind">${mark}</span>
    <div class="c-art">${glyph(c.art)}</div>
    <div class="c-box c-basic">${pips(basicCost)}<span>${esc(E.effectText(c.basic))}</span></div>
    <div class="c-box c-strong">${strongLead}<span>${esc(E.effectText(c.strong))}</span></div>
  </div>`;
}

function foeHTML(id, st = {}, attrs = '') {
  const d = ENEMIES[id];
  const armor = st.armor ?? d.armor;
  const tags = [
    ...d.traits.map((t) => `<span class="tag">${TRAIT_INFO[t].name}</span>`),
    ...d.resist.map((r) => `<span class="tag">Resists ${r === 'phys' ? 'physical' : r}</span>`),
  ].join('');
  const state = st.defeated ? 'Defeated' : st.guarded ? 'Guarded' : st.snared ? 'Snared' : '';
  return `<div class="foe ${st.sel ? 'sel' : ''} ${st.defeated ? 'dead' : ''}" ${attrs}>
    <div class="f-art">${glyph(d.art)}</div>
    <b>${esc(d.name)}</b>
    <div class="f-stats"><span title="Armor">${glyph('armor')}${armor}</span><span class="${elClass(d.el)}" title="Attack">${glyph('attack')}${d.attack}</span></div>
    <div class="f-tags">${tags}</div>
    ${state ? `<div class="f-state">${state}</div>` : ''}
  </div>`;
}

// ---------- title screen
function renderTitle() {
  const saved = loadSave();
  const heroes = Object.values(HEROES).map((h) => `
    <button class="hero-pick ${ui.heroPick === h.id ? 'sel' : ''}" data-act="pickHero" data-id="${h.id}">
      <span class="face" style="color:${h.color}">${glyph(h.id === 'kaela' ? 'flame' : 'leaf')}</span>
      <b>${h.name}</b><i>${h.title}</i><p>${h.blurb}</p>
    </button>`).join('');
  $('#app').innerHTML = `<div class="title">
    <div class="crest">${glyph('citadel')}</div>
    <h1>Emberwake</h1>
    <div class="sub">A solo deck-building march across the Ashen Marches</div>
    <div class="heroes">${heroes}</div>
    <div class="btns">
      ${saved && saved.phase !== 'over' ? `<button class="btn primary" data-act="continue">Continue (round ${saved.round}, level ${saved.hero.level})</button>` : ''}
      <button class="btn ${saved && saved.phase !== 'over' ? '' : 'primary'}" data-act="newGame">New game</button>
      <button class="btn" data-act="sheet" data-type="rules">How to play</button>
    </div>
    <div class="ver">Emberwake ${VERSION} · an original game</div>
  </div>`;
}

// ---------- map
const R = 34;
const SQ3 = Math.sqrt(3);
const hexXY = (h) => [R * SQ3 * (h.q + h.r / 2), R * 1.5 * h.r];
function hexPts(cx, cy, r = R) {
  let p = '';
  for (let i = 0; i < 6; i++) {
    const a = (Math.PI / 180) * (60 * i - 30);
    p += `${(cx + r * Math.cos(a)).toFixed(1)},${(cy + r * Math.sin(a)).toFixed(1)} `;
  }
  return p;
}
function hash(q, r, n) {
  let x = (q * 374761393 + r * 668265263 + n * 2147483647) | 0;
  x = (x ^ (x >>> 13)) * 1274126177;
  return ((x ^ (x >>> 16)) >>> 0) / 4294967296;
}
const TCOL = {
  plains: ['#a3b061', '#74863f'], forest: ['#4c8a4d', '#255231'], hills: ['#b39a62', '#7c6539'],
  marsh: ['#6c8573', '#3d5248'], wastes: ['#77564a', '#3c2a26'], mountain: ['#8d8a90', '#55525a'], lake: ['#4d92b8', '#235070'],
};
function decor(h, cx, cy) {
  const j = (n, amp) => (hash(h.q, h.r, n) - 0.5) * amp;
  let s = '';
  if (h.terrain === 'plains') {
    for (let i = 0; i < 5; i++) {
      const x = cx + j(i, 40); const y = cy + j(i + 9, 34);
      s += `<path d="M${x - 2.5},${y} l1.2,-4 M${x},${y} l0,-5 M${x + 2.5},${y} l-1.2,-4" stroke="#5d7032" stroke-width="1.1" fill="none" stroke-linecap="round"/>`;
    }
  } else if (h.terrain === 'forest') {
    for (let i = 0; i < 5; i++) {
      const x = cx + [-13, 10, -2, 14, -15][i] + j(i, 5); const y = cy + [-6, -10, 4, 9, 13][i] + j(i + 5, 4);
      s += `<path d="M${x},${y - 11} l6.5,10 h-4 l5,7 h-15 l5,-7 h-4z" fill="#1f4a2a" stroke="#143220" stroke-width=".6"/><path d="M${x},${y - 11} l3,5 l-4,1z" fill="#6aa862" opacity=".7"/>`;
    }
  } else if (h.terrain === 'hills') {
    for (let i = 0; i < 3; i++) {
      const x = cx + [-11, 9, -1][i] + j(i, 4); const y = cy + [-3, 2, 14][i];
      s += `<path d="M${x - 13},${y} q13,-17 26,0z" fill="#c9b077" stroke="#6a552e" stroke-width=".8"/><path d="M${x - 6},${y - 3} q5,-5 10,-2" stroke="#8a733f" fill="none" stroke-width=".8"/>`;
    }
  } else if (h.terrain === 'marsh') {
    for (let i = 0; i < 3; i++) {
      const x = cx + [-10, 9, -2][i] + j(i, 5); const y = cy + [-8, 0, 13][i];
      s += `<ellipse cx="${x}" cy="${y}" rx="10" ry="4" fill="#33566b" opacity=".75"/><path d="M${x - 4},${y} v-9 M${x},${y + 1} v-11 M${x + 4},${y} v-8" stroke="#2c3d2c" stroke-width="1.2"/><circle cx="${x}" cy="${y - 10.5}" r="1.5" fill="#5a4630"/>`;
    }
  } else if (h.terrain === 'wastes') {
    s += `<path d="M${cx - 18},${cy - 6 + j(1, 6)} l8,5 l5,-6 l7,8 l9,-3" stroke="#ff8a3c" stroke-width="1.4" fill="none" opacity=".85"/><path d="M${cx - 12},${cy + 12} l7,-4 l6,5 l8,-6" stroke="#e2552d" stroke-width="1.1" fill="none" opacity=".7"/>`;
    for (let i = 0; i < 3; i++) s += `<path d="M${cx + j(i, 36)},${cy + j(i + 4, 30)} l4,-5 l4,5z" fill="#2a1c19"/>`;
  } else if (h.terrain === 'mountain') {
    s += `<path d="M${cx - 22},${cy + 14} l13,-28 l8,13 l6,-9 l15,24z" fill="#5b5860" stroke="#2f2d33" stroke-width="1"/><path d="M${cx - 9},${cy - 14} l-4.5,10 l4,-2 l3,3 l2,-4z M${cx + 5},${cy - 10} l-3,5 l3.5,-1 l3,2z" fill="#f2f2f5"/>`;
  } else if (h.terrain === 'lake') {
    for (let i = 0; i < 3; i++) {
      const y = cy + [-10, 1, 12][i]; const x = cx + j(i, 8);
      s += `<path d="M${x - 14},${y} q3.5,-4 7,0 t7,0 t7,0 t7,0" stroke="#bfe2f2" stroke-width="1.1" fill="none" opacity=".7"/>`;
    }
  }
  return s;
}
const gAt = (name, x, y, size, color) => `<svg x="${x - size / 2}" y="${y - size / 2}" width="${size}" height="${size}" viewBox="0 0 24 24" fill="${color}" color="${color}">${GLYPHS[name] || GLYPHS.unknown}</svg>`;

function mapSVG() {
  const moves = E.moveOptions(G);
  const attacks = E.attackOptions(G);
  let defs = '';
  for (const [t, [a, b]] of Object.entries(TCOL)) {
    defs += `<radialGradient id="t-${t}" cx="50%" cy="38%" r="75%"><stop offset="0" stop-color="${a}"/><stop offset="1" stop-color="${b}"/></radialGradient>`;
  }
  let base = ''; let over = '';
  for (const k of Object.keys(G.map)) {
    const h = G.map[k];
    const [cx, cy] = hexXY(h);
    if (!h.revealed) {
      base += `<polygon data-hex="${k}" points="${hexPts(cx, cy, R - 0.6)}" fill="#171210" stroke="#2a221c" stroke-width="1"/>`;
      continue;
    }
    base += `<g data-hex="${k}"><polygon points="${hexPts(cx, cy, R - 0.6)}" fill="url(#t-${h.terrain})" stroke="#1a1410" stroke-width="1.6"/>${decor(h, cx, cy)}`;
    const hero = k === G.hero.pos;
    if (h.site) {
      const st = h.site;
      const hostile = st.enemies.length > 0;
      const sy = hero ? cy - 9 : cy;
      const r = hero ? 12 : 15;
      const ring = hostile ? '#e0563c' : st.conquered ? '#8fd070' : '#d9b25f';
      const fill = hostile ? '#2a0f0a' : '#241b15';
      const dimmed = (st.type === 'wayshrine' && st.visited) || (['camp', 'lair', 'barrow', 'ruins'].includes(st.type) && st.conquered);
      let icon = st.type;
      if (['camp', 'lair'].includes(st.type) && hostile) icon = ENEMIES[st.enemies[0]].art;
      const col = st.type === 'vein' ? ASPECT_INFO[st.aspect].color : hostile ? '#f3d9b8' : '#efe3c8';
      base += `<g opacity="${dimmed ? 0.45 : 1}"><circle cx="${cx}" cy="${sy}" r="${r}" fill="${fill}" stroke="${ring}" stroke-width="2"/>${gAt(icon, cx, sy, r * 1.45, col)}`;
      if (hostile && st.enemies.length > 1) base += `<circle cx="${cx + r - 2}" cy="${sy - r + 2}" r="6" fill="#e0563c" stroke="#000"/><text class="hex-label" x="${cx + r - 2}" y="${sy - r + 5.5}" text-anchor="middle" fill="#fff" font-size="9">${st.enemies.length}</text>`;
      base += '</g>';
    }
    base += '</g>';
    if (moves[k]) {
      const m = moves[k];
      over += `<g data-hex="${k}"><polygon points="${hexPts(cx, cy, R - 3)}" fill="${m.ok ? '#ffffff22' : 'none'}" stroke="${m.ok ? '#fff6c9' : '#ffffff55'}" stroke-width="${m.ok ? 2.4 : 1.4}" stroke-dasharray="${m.ok ? '' : '4 4'}" class="${m.ok ? 'pulse' : ''}"/>
        <circle cx="${cx}" cy="${cy + 20}" r="9" fill="${m.ok ? '#3d7a2d' : '#3a3230'}" stroke="#000"/><text class="hex-label" x="${cx}" y="${cy + 24}" text-anchor="middle" fill="${m.ok ? '#fff' : '#b9a98f'}">${m.cost}</text></g>`;
    }
    if (attacks.includes(k)) {
      over += `<g data-hex="${k}"><polygon points="${hexPts(cx, cy, R - 3)}" fill="#e0563c22" stroke="#ff6a4c" stroke-width="2.6" class="pulse"/>
        <circle cx="${cx}" cy="${cy + 20}" r="9" fill="#a02c19" stroke="#000"/>${gAt('attack', cx, cy + 20, 12, '#fff')}</g>`;
    }
  }
  const hh = G.map[G.hero.pos];
  const [hx, hy] = hexXY(hh);
  const hyy = hh.site ? hy + 12 : hy;
  const heroCol = HEROES[G.hero.id].color;
  over += `<g data-hex="${G.hero.pos}"><circle cx="${hx}" cy="${hyy}" r="12.5" fill="#000" opacity=".5"/><circle cx="${hx}" cy="${hyy - 1}" r="11.5" fill="${heroCol}" stroke="#fff8e0" stroke-width="2"/>${gAt('command', hx, hyy - 1, 15, '#1a120c')}</g>`;
  return `<svg class="map" xmlns="http://www.w3.org/2000/svg"><defs>${defs}</defs><g class="world">${base}${over}</g></svg>`;
}

function applyView() {
  const svg = $('svg.map');
  if (!svg || !G) return;
  const box = svg.getBoundingClientRect();
  if (!box.width) return;
  const [hx, hy] = hexXY(G.map[G.hero.pos]);
  if (!ui.view) ui.view = { cx: hx, cy: hy - 60, k: Math.min(1.15, box.width / (R * SQ3 * 6.2)) };
  if (ui.lastPos !== G.hero.pos) { ui.view.cx = hx; ui.view.cy = hy - 60; ui.lastPos = G.hero.pos; }
  const v = ui.view;
  svg.querySelector('.world').setAttribute('transform', `translate(${(box.width / 2 - v.cx * v.k).toFixed(1)},${(box.height / 2 - v.cy * v.k).toFixed(1)}) scale(${v.k.toFixed(3)})`);
}

// ---------- battle
const ELN = { phys: 'Physical', ember: 'Ember', frost: 'Frost', pure: 'Pure' };
function poolText(pool) {
  return Object.entries(pool).filter(([, n]) => n > 0).map(([el, n]) => `<b class="${elClass(el)}">${el === 'phys' ? '' : `${ELN[el]} `}${n}</b>`).join(' + ') || '0';
}
function fixSelection() {
  const cb = G.combat;
  if (!cb) { ui.sel = []; ui.guardSel = null; return; }
  if (cb.phase === 'volley' || cb.phase === 'attack') {
    const valid = cb.enemies.map((_, i) => i).filter((i) => E.canTarget(G, i));
    ui.sel = ui.sel.filter((i) => valid.includes(i));
    if (!ui.sel.length && valid.length === 1) ui.sel = [valid[0]];
  } else ui.sel = [];
  if (cb.phase === 'guard') {
    const valid = cb.enemies.map((_, i) => i).filter((i) => { const en = cb.enemies[i]; return !en.defeated && !en.snared && !en.guarded; });
    if (!valid.includes(ui.guardSel)) ui.guardSel = valid.length ? valid[0] : null;
  } else ui.guardSel = null;
}
function woundsFrom(en) {
  return Math.min(E.handLimit(G), Math.ceil(en.remaining / E.armor(G)));
}
function battleHTML() {
  const cb = G.combat;
  fixSelection();
  const order = ['volley', 'guard', 'damage', 'attack'];
  const names = { volley: 'Volley', guard: 'Guard', damage: 'Damage', attack: 'Strike' };
  const pi = order.indexOf(cb.phase);
  const phases = order.map((p, i) => `<div class="${i === pi ? 'now' : i < pi ? 'done' : ''}">${names[p]}</div>`).join('');
  const foes = cb.enemies.map((en, i) => foeHTML(en.id, {
    armor: E.enemyArmor(en), defeated: en.defeated, guarded: en.guarded, snared: en.snared,
    sel: ui.sel.includes(i) || ui.guardSel === i,
  }, `data-act="foe" data-i="${i}"`)).join('');
  let read = '';
  if (cb.phase === 'volley' || cb.phase === 'attack') {
    const need = ui.sel.reduce((n, i) => n + E.enemyArmor(cb.enemies[i]), 0);
    const have = E.strikePower(G, ui.sel);
    const kinds = cb.phase === 'volley' ? (cb.walled ? ['siege'] : ['ranged', 'siege']) : ['ranged', 'siege', 'melee'];
    const lbl = { ranged: 'Ranged', siege: 'Siege', melee: 'Melee' };
    const sums = kinds.map((kd) => `${lbl[kd]} ${poolText(cb.atk[kd])}`).join(' · ');
    const resisted = ['phys', 'ember', 'frost'].filter((el) => ui.sel.some((i) => ENEMIES[cb.enemies[i].id].resist.includes(el)) && kinds.some((kd) => cb.atk[kd][el] > 0));
    const notes = [];
    if (cb.phase === 'volley' && cb.walled) notes.push('Walls: only Siege attacks count in the Volley.');
    if (cb.phase === 'volley' && cb.enemies.some((en) => !en.defeated && ENEMIES[en.id].traits.includes('warded'))) notes.push('Warded foes cannot be targeted yet.');
    if (resisted.length) notes.push(`${resisted.map((r) => ELN[r]).join(' and ')} attack is halved by resistance.`);
    const can = ui.sel.length > 0 && have >= need;
    read = `<div class="readout">
      <div class="big ${can ? 'okc' : 'noc'}">${ui.sel.length ? `Power ${have} vs Armor ${need}` : 'Tap a foe to target it'}</div>
      <div class="sums">${sums}${notes.length ? `<br>${notes.join(' ')}` : ''}</div>
      <div class="row"><button class="btn primary" data-act="strike" ${can ? '' : 'disabled'}>${glyph('attack')} Strike${ui.sel.length > 1 ? ` ${ui.sel.length} foes` : ''}</button></div>
    </div>`;
  } else if (cb.phase === 'guard') {
    if (ui.guardSel === null) read = '<div class="readout">Nothing left to guard against.</div>';
    else {
      const en = cb.enemies[ui.guardSel];
      const d = ENEMIES[en.id];
      const need = E.blockNeeded(en);
      const have = E.blockPower(G, ui.guardSel);
      const notes = [];
      if (d.traits.includes('swift')) notes.push('Swift: needs double block.');
      if (d.el !== 'phys') notes.push(`${ELN[d.el]} attack: only ${d.el === 'ember' ? 'Frost' : 'Ember'} and Pure block count in full, the rest is halved.`);
      const dmg = d.attack * (d.traits.includes('brutal') ? 2 : 1);
      read = `<div class="readout">
        <div class="big ${have >= need ? 'okc' : 'noc'}">Block ${have} of ${need} vs ${esc(d.name)}</div>
        <div class="sums">Your block: ${poolText(cb.blk)}. Unguarded it deals ${dmg} damage (${Math.min(E.handLimit(G), Math.ceil(dmg / E.armor(G)))} wound${Math.ceil(dmg / E.armor(G)) > 1 ? 's' : ''}). ${notes.join(' ')}</div>
        <div class="row"><button class="btn primary" data-act="guard" ${have >= need ? '' : 'disabled'}>${glyph('block')} Guard</button></div>
      </div>`;
    }
  } else if (cb.phase === 'damage') {
    const i = cb.enemies.findIndex((en) => !en.dealt);
    const en = cb.enemies[i];
    const d = ENEMIES[en.id];
    const venom = d.traits.includes('venom');
    const w = woundsFrom(en);
    const units = G.hero.units.map((u, ui2) => {
      if (u.wounded || cb.absorbed.includes(ui2)) return '';
      const cd = COMPANIONS[u.id];
      return `<button class="btn small" data-act="assign" data-i="${i}" data-target="${ui2}">${glyph(cd.art)} ${esc(cd.name)} absorb ${cd.armor}${venom ? ' (slain)' : ''}</button>`;
    }).join('');
    read = `<div class="readout">
      <div class="big noc">${esc(d.name)} deals ${en.remaining} damage</div>
      <div class="sums">Your armor is ${E.armor(G)}: each ${E.armor(G)} damage, or part of it, is one wound.${venom ? ' Venom: as many wounds again go to your discard.' : ''}</div>
      <div class="row"><button class="btn danger small" data-act="assign" data-i="${i}" data-target="hero">${glyph('wound')} Take ${w} wound${w > 1 ? 's' : ''}</button>${units}</div>
    </div>`;
  }
  return `<div class="battle"><div class="phases">${phases}</div><div class="foes">${foes}</div>${read}</div>`;
}

// ---------- game screen
function hintText() {
  if (G.phase === 'over') return '';
  const cb = G.combat;
  if (cb) {
    return {
      volley: 'Volley: play Ranged or Siege cards, pick foes, Strike. Then move on.',
      guard: 'Guard: play Block cards against one foe at a time, or take the hits.',
      damage: 'Damage: decide who takes each unguarded blow.',
      attack: 'Strike: play Attack cards, pick foes, Strike. Survivors remain.',
    }[cb.phase];
  }
  const t = G.turn;
  if (G.round >= RULES.rounds && !t.acted && E.canEndRound(G)) return 'The last night. Ending it now ends the game.';
  if (E.canEndRound(G) && G.hero.hand.filter((x) => x !== 'wound').length < 2) return 'Your deck is empty. End the round to reshuffle.';
  if (E.shopHere(G) && !t.fought) return `${SITES[E.shopHere(G)].name}: play Sway cards, then tap Site.`;
  if (t.acted) return 'You have acted. Use what is left, then end your turn.';
  if (Object.keys(E.moveOptions(G)).length && t.move === 0) return 'Tap a card to play it. Move cards let you tap a glowing hex.';
  return 'Tap a glowing hex to move, or a red hex to attack.';
}

function topHTML() {
  const pips = [];
  for (let r = 1; r <= RULES.rounds; r++) {
    const night = r % 2 === 0;
    pips.push(`<span class="pip ${night ? 'night' : 'day'} ${r === G.round ? 'now' : r < G.round ? 'past' : ''}">${glyph(night ? 'moon' : 'sun')}</span>`);
  }
  const next = E.nextThreshold(G);
  const st = G.hero.standing;
  return `<div class="top">
    <div class="pips" data-act="sheet" data-type="rules">${pips.join('')}</div>
    <div class="turn"><b>${G.night ? 'Night' : 'Day'} ${Math.ceil(G.round / 2)}</b>turn ${G.roundTurn}/${RULES.turnsPerRound}</div>
    <div class="spacer"></div>
    <button class="stat" data-act="sheet" data-type="hero">${glyph('renown')}${G.hero.renown}<small>${next ? `/${next}` : ''} L${G.hero.level}</small></button>
    <button class="stat" data-act="sheet" data-type="hero">${glyph('armor')}${E.armor(G)}</button>
    <button class="stat" data-act="sheet" data-type="hero">${glyph('standing')}${st > 0 ? '+' : ''}${st}</button>
    <button class="iconbtn" data-act="sheet" data-type="menu">${glyph('menu')}</button>
  </div>`;
}

function stripHTML() {
  const t = G.turn;
  const h = G.hero;
  const chips = [];
  const chip = (icon, label, n, extra = '') => `<span class="chip ${n ? '' : 'zero'}">${glyph(icon)}<span class="lbl">${label}</span>${n}${extra}</span>`;
  if (!G.combat) {
    chips.push(chip('move', 'Move', t.move));
    const mod = E.standingMod(G);
    chips.push(chip('sway', 'Sway', E.swayAvail(G), mod && E.shopHere(G) ? `<span class="lbl">(${mod > 0 ? '+' : ''}${mod})</span>` : ''));
    if (t.heal) chips.push(chip('heal', 'Heal', t.heal));
  }
  const ess = ASPECTS.flatMap((a) => Array(h.essence[a]).fill(dot(a))).join('');
  const tide = t.tide ? E.tideAspects(G).map(dot).join('<span class="lbl">/</span>') : '';
  chips.push(`<span class="chip ${ess || tide ? '' : 'zero'}" data-act="sheet" data-type="essence"><span class="lbl">Essence</span>${ess}${tide ? `<span class="lbl">${G.night ? 'dusk' : 'sun'}:</span>${tide}` : ''}${!ess && !tide ? '0' : ''}</span>`);
  const shards = ASPECTS.flatMap((a) => Array(h.shards[a]).fill(dia(a))).join('');
  chips.push(`<span class="chip ${shards ? '' : 'zero'}" data-act="sheet" data-type="essence"><span class="lbl">Shards</span>${shards || '0'}</span>`);
  chips.push(`<span class="chip" data-act="sheet" data-type="deck">${glyph('deck')}<span class="lbl">Deck</span>${h.deck.length}</span>`);
  return `<div class="strip">${chips.join('')}</div>`;
}

function actionsHTML() {
  const b = [];
  b.push(`<button class="btn narrow ${history.length ? '' : 'off'}" data-act="undo">${glyph('undo')}</button>`);
  if (G.combat) {
    const cb = G.combat;
    const unguarded = cb.enemies.some((en) => !en.defeated && !en.snared && !en.guarded);
    const label = { volley: 'To Guard ▸', guard: unguarded ? 'Take the hits ▸' : 'To Strike ▸', damage: 'Assign damage above', attack: cb.enemies.some((en) => !en.defeated) ? 'Break off ▸' : 'End battle' }[cb.phase];
    b.push(`<button class="btn primary" data-act="next" ${cb.phase === 'damage' ? 'disabled' : ''}>${label}</button>`);
  } else {
    const here = E.heroHex(G);
    if (here.site) b.push(`<button class="btn" data-act="sheet" data-type="hex" data-hexkey="${G.hero.pos}">${glyph(here.site.type)} Site</button>`);
    if (E.canRecover(G)) b.push(`<button class="btn" data-act="sheet" data-type="recover">${glyph('heal')} Recover</button>`);
    const blocker = E.endTurnBlocker(G);
    if (E.canEndRound(G)) {
      const last = G.round >= RULES.rounds;
      const prefer = !last && G.hero.hand.filter((x) => x !== 'wound').length < 2;
      b.push(`<button class="btn ${prefer ? 'primary' : ''}" data-act="${last ? 'concede' : 'endRound'}">${last ? 'Concede' : `${glyph(G.night ? 'sun' : 'moon')} End ${G.night ? 'night' : 'day'}`}</button>`);
      b.push(`<button class="btn ${prefer ? '' : 'primary'} ${blocker ? 'off' : ''}" data-act="endTurn">End turn</button>`);
    } else b.push(`<button class="btn primary ${blocker ? 'off' : ''}" data-act="endTurn">End turn</button>`);
  }
  return `<div class="actions">${b.join('')}</div>`;
}

function partyHTML() {
  const units = G.hero.units.map((u, i) => {
    const d = COMPANIONS[u.id];
    return `<button class="token ${u.spent ? 'spent' : ''} ${u.wounded ? 'hurt' : ''}" data-act="sheet" data-type="unit" data-i="${i}">${glyph(d.art)}${esc(d.name)}${u.wounded ? ' ✖' : ''}</button>`;
  });
  const skills = G.hero.skills.map((id) => {
    const sk = SKILLS[id];
    const used = sk.use !== 'passive' && (G.turn.skillsUsed.includes(id) || G.roundSkillsUsed.includes(id));
    return `<button class="token skill ${used ? 'spent' : ''}" data-act="sheet" data-type="skill" data-id="${id}">${glyph('level')}${esc(sk.name)}</button>`;
  });
  return `<div class="party">${units.join('')}${skills.join('')}</div>`;
}

function handHTML() {
  const hand = G.hero.hand;
  if (!hand.length) return '<div class="hand"><span class="empty">Your hand is empty.</span></div>';
  const avail = Math.min(window.innerWidth, 520) - 12;
  const step = hand.length > 1 ? Math.min(88, Math.max(50, (avail - 84) / (hand.length - 1))) : 88;
  const cards = hand.map((id, i) => {
    const usable = id !== 'wound' && E.cardOptions(G, i).some((o) => o.ok && o.mode !== 'discard' && o.mode !== 'channel');
    return cardHTML(id, { attrs: `data-act="sheet" data-type="card" data-i="${i}"`, dim: !usable && !G.pending.length });
  }).join('');
  return `<div class="hand ${step < 80 ? 'tight' : ''}" style="--lap:${(step - 84).toFixed(1)}px">${cards}</div>`;
}

function renderGame() {
  const stage = G.combat
    ? `<div class="stage">${battleHTML()}</div>`
    : `<div class="stage ${G.night ? 'night' : ''}">${mapSVG()}
        <div class="sky">${G.night ? 'Night: you see 1 hex; forests slow, wastes quicker' : 'Day: you see 2 hexes'}</div>
        <div class="float"><button class="iconbtn" data-act="sheet" data-type="log">${glyph('log')}</button><button class="iconbtn" data-act="center">${glyph('center')}</button></div>
      </div>`;
  $('#app').innerHTML = `${topHTML()}${stage}${stripHTML()}<div class="hint">${hintText()}</div>${actionsHTML()}${partyHTML()}${handHTML()}`;
  applyView();
}

// ---------- sheets
function sheetWrap(inner, { modal = false } = {}) {
  return `<div class="shade" ${modal ? '' : 'data-act="closeSheet"'}><div class="sheet" data-act="noop">${modal ? '' : '<div class="grab"></div>'}${inner}</div></div>`;
}
const modeLabel = { move: 'Move 1', sway: 'Sway 1', attack: 'Attack 1', block: 'Block 1' };

function cardSheet(i) {
  const id = G.hero.hand[i];
  const c = CARDS[id];
  if (!c) return '';
  if (c.kind === 'wound') {
    return sheetWrap(`<div class="cols">${cardHTML(id, { size: 'big' })}<div class="stack"><h2>Wound</h2>
      <p>A dead card. If your hand holds as many wounds as your hand limit, you are knocked out and lose your other cards.</p>
      <p><b>Heal</b> removes wounds for good. <b>Recover</b> (instead of moving or acting) sends every wound in hand to your discard pile.</p>
      ${G.turn.heal > 0 ? `<button class="btn primary" data-act="healWound">${glyph('heal')} Heal this wound (1 Heal)</button>` : ''}</div></div>`);
  }
  const opts = E.cardOptions(G, i);
  const find = (m) => opts.find((o) => o.mode === m);
  const btn = (o, label, cls = '') => (o ? `<button class="btn ${cls}" data-act="play" data-i="${i}" data-mode="${o.mode}" ${o.ok ? '' : 'disabled'}><span>${label}${!o.ok && o.why ? `<span class="why">${esc(o.why)}</span>` : ''}${o.ok && o.partial ? '<span class="why">Part of this has no use right now and would be lost</span>' : ''}</span></button>` : '');
  const basic = find('basic'); const strong = find('strong'); const channel = find('channel');
  const costDots = (n) => dot(c.aspect).repeat(n);
  const improv = ['move', 'sway', 'attack', 'block'].map((k) => {
    const o = find(`improv:${k}`);
    return `<button class="btn small" data-act="play" data-i="${i}" data-mode="improv:${k}" ${o && o.ok ? '' : 'disabled'}>${glyph(k)} 1</button>`;
  }).join('');
  const strongLabel = c.kind === 'relic' ? `<b>Unleash</b> (destroys it): ${esc(E.effectText(c.strong))}` : `<b>Empower</b> ${costDots(strong.cost)} ${esc(E.effectText(c.strong))}`;
  return sheetWrap(`<div class="cols">${cardHTML(id, { size: 'big' })}
    <div class="stack">
      ${btn(basic, `<b>Play</b> ${costDots(basic.cost)} ${esc(E.effectText(c.basic))}`, basic.ok ? 'primary' : '')}
      ${btn(strong, strongLabel, strong.ok && !basic.ok ? 'primary' : '')}
      ${channel ? btn(channel, `<b>Channel</b> for ${dot(c.aspect)} essence`) : ''}
      <div class="row4" title="Improvise">${improv}</div>
      ${btn(find('discard'), 'Discard')}
    </div></div>`);
}

function unitSheet(i) {
  const u = G.hero.units[i];
  if (!u) return '';
  const d = COMPANIONS[u.id];
  const opts = E.unitOptions(G, i);
  const abil = d.abilities.map((ab, k) => `<button class="btn ${opts[k] && opts[k].ok ? 'primary' : ''}" data-act="unit" data-i="${i}" data-ability="${k}" ${opts[k] && opts[k].ok ? '' : 'disabled'}>${esc(E.effectText(ab))}</button>`).join('');
  const state = u.wounded ? 'Wounded: cannot act until healed (1 Heal).' : u.spent ? 'Spent: readies at the start of the next round.' : 'Ready. Using one ability spends them for the round.';
  return sheetWrap(`<h2>${glyph(d.art)} ${esc(d.name)}</h2><p>Armor ${d.armor}. ${state}</p>
    <div class="stack">${abil}
    ${u.wounded && G.turn.heal > 0 ? `<button class="btn" data-act="healUnit" data-i="${i}">${glyph('heal')} Heal them (1 Heal)</button>` : ''}
    ${G.combat ? '' : `<button class="btn small danger center" data-act="dismiss" data-i="${i}">Dismiss</button>`}</div>`);
}

function skillSheet(id) {
  const sk = SKILLS[id];
  const ok = E.skillOk(G, id);
  return sheetWrap(`<h2>${glyph('level')} ${esc(sk.name)}</h2><p>${esc(sk.text)}</p>
    ${sk.use === 'passive' ? '<p>Always active.</p>' : `<div class="stack"><button class="btn primary center" data-act="skill" data-id="${id}" ${ok ? '' : 'disabled'}>Use</button></div>`}`);
}

function shopHTML() {
  const shop = E.shopOptions(G);
  if (!shop) return G.turn.fought && E.shopHere(G) ? '<p>You fought this turn. Come back next turn to trade.</p>' : '';
  const mod = E.standingMod(G);
  let h = `<p>You have <b>${shop.sway} Sway</b>${mod ? ` (includes ${mod > 0 ? '+' : ''}${mod} from Standing)` : ''}. Play Sway cards before trading. Trading ends your movement for the turn.</p>`;
  if (shop.heal) h += `<div class="item"><span class="ic">${glyph('heal')}</span><div class="tx"><b>Healer</b>Remove one wound from your hand.</div><button class="btn small ${shop.heal.ok ? 'primary' : ''}" data-act="buyHeal" ${shop.heal.ok ? '' : 'disabled'}>${shop.heal.cost} Sway</button></div>`;
  if (shop.recruits.length) {
    h += `<h3>Companions (${G.hero.units.length}/${G.hero.command} command)</h3>`;
    for (const r of shop.recruits) {
      const d = COMPANIONS[r.id];
      h += `<div class="item"><span class="ic">${glyph(d.art)}</span><div class="tx"><b>${esc(d.name)}</b>Armor ${d.armor}. ${d.abilities.map(E.effectText).join(' / ')}${r.why ? `<br><i>${r.why}</i>` : ''}</div><button class="btn small ${r.ok ? 'primary' : ''}" data-act="recruit" data-id="${r.id}" ${r.ok ? '' : 'disabled'}>${r.cost} Sway</button></div>`;
    }
  } else if (['village', 'keep', 'sanctum'].includes(shop.type)) h += '<p><i>No companions on offer here this round.</i></p>';
  if (shop.cards.length) {
    h += `<h3>${shop.type === 'spire' ? 'Arcana' : 'Advanced cards'}</h3><div class="offer">`;
    for (const cd of shop.cards) h += `<div class="pick">${cardHTML(cd.id, { size: 'mid', attrs: `data-act="sheet" data-type="zoom" data-id="${cd.id}"` })}<button class="btn small ${cd.ok ? 'primary' : ''} center" data-act="buy" data-id="${cd.id}" ${cd.ok ? '' : 'disabled'}>${cd.cost} Sway</button></div>`;
    h += '</div>';
  }
  return h;
}

function hexSheet(k) {
  const h = G.map[k];
  if (!h) return '';
  if (!h.revealed) return sheetWrap('<h2>Unexplored</h2><p>Move closer to reveal this land.</p>');
  const t = TERRAIN[h.terrain];
  const cost = t.cost[0] === null ? 'Impassable' : `Move cost ${t.cost[0]} by day, ${t.cost[1]} by night`;
  let body = `<p>${t.name}. ${cost}.</p>`;
  let title = t.name;
  let icon = '';
  if (h.site) {
    const st = h.site;
    title = SITES[st.type].name + (st.type === 'vein' ? ` (${cap(st.aspect)})` : '');
    icon = glyph(st.type);
    body += `<p>${SITES[st.type].text}</p>`;
    if (st.conquered) body += '<p><b>Conquered.</b></p>';
    if (st.type === 'wayshrine' && st.visited) body += '<p><i>Its blessing is spent.</i></p>';
    if (st.enemies.length) {
      if (st.seen) body += `<div class="foes">${st.enemies.map((id) => foeHTML(id)).join('')}</div>`;
      else body += `<p><i>${st.enemies.length} unknown defender${st.enemies.length > 1 ? 's' : ''}. Stand next to it by day, or attack, to see them.</i></p>`;
    }
    if (E.attackOptions(G).includes(k)) body += `<div class="stack" style="margin-top:10px"><button class="btn danger center" data-act="attack" data-hexkey="${k}">${glyph('attack')} Attack</button></div>`;
    else if (st.enemies.length && !G.turn.acted) body += `<p><i>${['barrow', 'ruins'].includes(st.type) ? 'Enter this hex to fight.' : 'Stand next to it to attack.'}</i></p>`;
    if (k === G.hero.pos) body += shopHTML();
  }
  return sheetWrap(`<h2>${icon} ${esc(title)}</h2>${body}`);
}

function pendingSheet() {
  const p = { ...G.pending[G.pending.length - 1] };
  p.options = E.pendingOptions(G, p);
  let title = 'Choose'; let body = '';
  const btns = (labels) => `<div class="stack">${labels.map((l, i) => `<button class="btn center" data-act="choose" data-i="${i}">${l}</button>`).join('')}</div>`;
  if (p.type === 'choice') { title = 'Choose one'; body = btns(p.options.map((o) => esc(E.effectText(o)))); }
  else if (p.type === 'aspect') {
    title = p.kind === 'essence' ? 'Gain essence of which aspect?' : 'Gain a shard of which aspect?';
    body = btns(ASPECTS.map((a) => `${p.kind === 'essence' ? dot(a) : dia(a)} ${ASPECT_INFO[a].name}`));
  } else if (p.type === 'ready') { title = 'Ready which companion?'; body = btns(p.options.map((i) => esc(COMPANIONS[G.hero.units[i].id].name))); }
  else if (p.type === 'snare' || p.type === 'weaken') {
    title = p.type === 'snare' ? 'Snare which foe?' : `Which foe gets Armor -${p.n}?`;
    body = btns(p.options.map((i) => esc(ENEMIES[G.combat.enemies[i].id].name)));
  } else if (p.type === 'reward') {
    if (p.kind === 'skill') {
      title = `Level ${p.level}: learn a skill`;
      body = p.options.map((id, i) => `<div class="item"><span class="ic">${glyph('level')}</span><div class="tx"><b>${esc(SKILLS[id].name)}</b>${esc(SKILLS[id].text)}</div><button class="btn small primary" data-act="choose" data-i="${i}">Learn</button></div>`).join('');
    } else {
      title = { advanced: p.level ? `Level ${p.level}: take an advanced card` : 'Take a card', arcana: 'The spire’s library: learn one Arcana', relic: 'Claim a relic' }[p.kind];
      body = `<div class="offer">${p.options.map((id, i) => `<div class="pick">${cardHTML(id, { size: 'mid' })}<button class="btn small primary center" data-act="choose" data-i="${i}">Take</button></div>`).join('')}</div><p><i>It goes on top of your deck.</i></p>`;
    }
  }
  return sheetWrap(`<h2>${title}</h2>${body}`, { modal: true });
}

function recoverSheet() {
  const hand = G.hero.hand;
  const non = hand.map((id, i) => [id, i]).filter(([id]) => id !== 'wound');
  if (!non.length) {
    return sheetWrap(`<h2>${glyph('heal')} Catch your breath</h2><p>Your hand is all wounds. Set aside up to 2 of them to your discard pile. This is your whole turn.</p><div class="stack"><button class="btn primary center" data-act="recover" data-i="0">Recover</button></div>`);
  }
  return sheetWrap(`<h2>${glyph('heal')} Recover</h2><p>Give up one card to send all ${E.woundsInHand(G)} wound(s) in your hand to the discard pile. You cannot move or act this turn.</p>
    <div class="offer">${non.map(([id, i]) => `<div class="pick">${cardHTML(id, { size: 'mid' })}<button class="btn small center" data-act="recover" data-i="${i}">Give up</button></div>`).join('')}</div>`);
}

function heroSheet() {
  const h = G.hero;
  const hero = HEROES[h.id];
  const next = E.nextThreshold(G);
  const mod = E.standingMod(G);
  return sheetWrap(`<h2>${glyph('command')} ${hero.name}</h2>
    <div class="kv">
      <b>Level</b><span>${h.level} (renown ${h.renown}${next ? `, next level at ${next}` : ''})</span>
      <b>Armor</b><span>${E.armor(G)}: damage per wound</span>
      <b>Hand limit</b><span>${E.handLimit(G)}</span>
      <b>Command</b><span>${h.units.length} of ${h.command} companions</span>
      <b>Standing</b><span>${h.standing} (${mod >= 0 ? '+' : ''}${mod} Sway when trading)</span>
      <b>Score</b><span>${E.score(G)}</span>
    </div>
    <h3>Skills</h3>${h.skills.length ? `<ul>${h.skills.map((id) => `<li><b>${SKILLS[id].name}.</b> ${SKILLS[id].text}</li>`).join('')}</ul>` : '<p><i>None yet. You learn one at levels 2, 4, 6 and 8.</i></p>'}
    <p><i>Odd levels raise command, and armor or hand limit in turn.</i></p>`);
}

function deckSheet() {
  const h = G.hero;
  const count = (arr) => {
    const m = {};
    for (const id of arr) m[id] = (m[id] || 0) + 1;
    return Object.entries(m).sort((a, b) => CARDS[a[0]].name.localeCompare(CARDS[b[0]].name)).map(([id, n]) => `${CARDS[id].name}${n > 1 ? ` ×${n}` : ''}`).join(', ') || 'none';
  };
  return sheetWrap(`<h2>${glyph('deck')} Your cards</h2>
    <h3>Deck (${h.deck.length}, order hidden)</h3><p>${count(h.deck)}</p>
    <h3>Discard (${h.discard.length})</h3><p>${count(h.discard)}</p>
    <h3>Played this turn (${h.played.length})</h3><p>${count(h.played)}</p>
    <p><i>${G.round >= RULES.rounds ? 'This is the last night: when it ends, the game ends.' : `When the deck runs out, end the ${G.night ? 'night' : 'day'} at the start of a turn to reshuffle everything.`} A ${G.night ? 'night' : 'day'} lasts at most ${RULES.turnsPerRound} turns.</i></p>`);
}

function essenceSheet() {
  return sheetWrap(`<h2>Essence and shards</h2>
    <p>${ASPECTS.map((a) => `${dot(a)} ${ASPECT_INFO[a].name}`).join(' &nbsp; ')}</p>
    <ul>
      <li><b>Empowering</b> a card costs one essence of its aspect (Arcana cost one to play, two to overcast).</li>
      <li><b>Channel</b> any card except a relic to turn it into one essence of its aspect. Essence fades at the end of the turn.</li>
      <li><b>The sky gives one free essence each turn:</b> Radiant or Verdant by day, Ember or Frost by night.</li>
      <li><b>Shards</b> ${dia('ember')} are stored essence. They keep between turns, up to ${RULES.shardCap} per aspect, and are spent last.</li>
    </ul>`);
}

function logSheet() {
  return sheetWrap(`<h2>${glyph('log')} Chronicle</h2><div class="log">${[...G.log].reverse().map((l) => `<div>${esc(l)}</div>`).join('')}</div>`);
}

function menuSheet() {
  return sheetWrap(`<h2>Emberwake</h2><div class="stack">
    <button class="btn" data-act="sheet" data-type="rules">${glyph('info')} How to play</button>
    <button class="btn" data-act="sheet" data-type="hero">${glyph('command')} Hero</button>
    <button class="btn" data-act="sheet" data-type="deck">${glyph('deck')} Cards</button>
    <button class="btn" data-act="sheet" data-type="log">${glyph('log')} Chronicle</button>
    <button class="btn" data-act="toTitle">Save and quit to title</button>
    <button class="btn danger" data-act="abandon">Abandon this game</button>
  </div><p style="text-align:center;color:#6d604d;font-size:11px">version ${VERSION} · seed ${G ? G.seed : ''}</p>`);
}

function rulesSheet() {
  return sheetWrap(`<h2>How to play</h2>
    <p>You have <b>${RULES.rounds} rounds</b> (three days and three nights) to cross the Marches and take <b>the Ashen Citadel</b> at the north edge. Grow stronger on the way.</p>
    <h3>Your turn</h3>
    <ul>
      <li><b>Move</b>: play cards for Move points, then tap glowing hexes. Each hex shows its cost.</li>
      <li>Then do <b>one thing</b>: fight (tap a red hex), or trade at a site (the Site button).</li>
      <li><b>End turn</b>: you keep unplayed cards and draw back up to your hand limit. You must play or discard at least one card each turn.</li>
    </ul>
    <h3>Cards</h3>
    <ul>
      <li><b>Play</b> the top effect for free, or <b>Empower</b> the bottom effect by paying one essence of the card's aspect.</li>
      <li><b>Channel</b> a card: discard it for one essence of its aspect.</li>
      <li><b>Improvise</b>: discard it for Move 1, Sway 1, Attack 1 or Block 1.</li>
      <li>The sky gives one free essence per turn: Radiant or Verdant by day, Ember or Frost by night. Shards are essence you can keep.</li>
    </ul>
    <h3>Battle</h3>
    <ul>
      <li><b>Volley</b>: Ranged and Siege attacks strike before the foe does. Behind walls (keeps, spires, the citadel) only Siege counts here.</li>
      <li><b>Guard</b>: play Block equal to a foe's attack to stop it completely.</li>
      <li><b>Damage</b>: each unguarded foe deals its attack. You take one wound per point of your armor, rounded up. An unwounded companion can absorb damage equal to its armor and becomes wounded.</li>
      <li>Attack played early is kept for the Strike; Block must be played by the Guard phase.</li>
      <li><b>Strike</b>: all your attacks count. To defeat foes, match their total armor. Unused attack is lost when you strike.</li>
      <li>Resistance halves attacks of that kind, for the whole strike if any target resists, so strike mixed foes one at a time. Ember attacks are best blocked with Frost block, Frost attacks with Ember block; other block counts half. Pure block always counts in full.</li>
      <li>Defeated foes stay defeated. Survivors keep their site, and you may return.</li>
    </ul>
    <h3>Foe traits</h3>
    <ul>${Object.values(TRAIT_INFO).map((t) => `<li><b>${t.name}.</b> ${t.text}</li>`).join('')}</ul>
    <h3>Wounds</h3>
    <ul>
      <li>Wounds are dead cards in your hand. With as many wounds as your hand limit you are knocked out and lose the rest of your hand.</li>
      <li><b>Heal</b> removes them (with a wounded companion you choose: tap the wound or the companion). <b>Recover</b> instead of moving, fighting or trading: give up one card and all wounds in hand go to your discard.</li>
    </ul>
    <h3>Sites</h3>
    <ul>${Object.entries(SITES).map(([, s]) => `<li><b>${s.name}.</b> ${s.text}</li>`).join('')}</ul>
    <h3>Time</h3>
    <ul>
      <li>When your deck is empty you may end the day or night at the start of a turn. Everything is reshuffled and companions ready. A day or night lasts at most ${RULES.turnsPerRound} turns.</li>
      <li>By night you see only adjacent hexes, forests cost 4 and ash wastes 3.</li>
      <li>Leaving a hex next to a reaver camp or wyrm lair costs +1 Move.</li>
    </ul>
    <h3>Growth</h3>
    <ul>
      <li>Defeating foes earns renown. Even levels grant a skill and an advanced card; odd levels raise command and armor or hand limit.</li>
      <li>Standing rises when you clear camps and lairs and falls when you storm keeps. It adds to or takes from your Sway when trading.</li>
    </ul>`);
}

function resultSheet() {
  const won = G.over.won;
  return sheetWrap(`<div class="result ${won ? 'win' : 'lose'}">
    <div class="crest">${glyph(won ? 'crown' : 'skull')}</div>
    <h2 style="justify-content:center">${won ? 'The Citadel has fallen' : 'The Marches are lost'}</h2>
    <p>${won ? `The Ashen Tyrant is broken in round ${G.round}.` : 'The last night ended with the Tyrant still on his throne.'}</p>
    <div class="score">${G.over.score}</div>
    <p>Level ${G.hero.level} · ${G.stats.defeated} foes defeated · ${G.stats.conquered} sites taken</p>
    <div class="stack"><button class="btn primary center" data-act="toTitle">Back to title</button><button class="btn center" data-act="sheet" data-type="log">Read the chronicle</button></div>
  </div>`, { modal: true });
}

function renderSheet() {
  const root = $('#sheet-root');
  let html = '';
  const s = ui.sheet;
  if (G && G.pending.length && G.phase !== 'over') html = pendingSheet();
  else if (s) {
    if (s.type === 'rules') html = rulesSheet();
    else if (!G) html = '';
    else if (s.type === 'card') html = cardSheet(s.i);
    else if (s.type === 'zoom') html = sheetWrap(`<div style="display:flex;justify-content:center">${cardHTML(s.id, { size: 'big' })}</div>`);
    else if (s.type === 'unit') html = unitSheet(s.i);
    else if (s.type === 'skill') html = skillSheet(s.id);
    else if (s.type === 'hex') html = hexSheet(s.hexkey);
    else if (s.type === 'recover') html = recoverSheet();
    else if (s.type === 'hero') html = heroSheet();
    else if (s.type === 'deck') html = deckSheet();
    else if (s.type === 'essence') html = essenceSheet();
    else if (s.type === 'log') html = logSheet();
    else if (s.type === 'menu') html = menuSheet();
    else if (s.type === 'concede') html = sheetWrap('<h2>Concede?</h2><p>This is the last night. Ending it now ends the game with the Tyrant undefeated.</p><div class="stack"><button class="btn danger center" data-act="endRound">End the game</button><button class="btn center" data-act="closeSheet">Keep playing</button></div>');
  } else if (G && G.phase === 'over') html = resultSheet();
  root.innerHTML = html;
}

function render() {
  if (!G) renderTitle();
  else renderGame();
  renderSheet();
}

// ---------- input
function onHexTap(k) {
  if (!G || G.combat || G.pending.length || G.phase === 'over') return;
  const moves = E.moveOptions(G);
  if (moves[k]) {
    if (moves[k].ok) dispatch({ type: 'move', to: k });
    else toast(`Needs ${moves[k].cost} Move (you have ${G.turn.move})`);
    return;
  }
  ui.sheet = { type: 'hex', hexkey: k };
  renderSheet();
}

const ACTS = {
  noop() {},
  closeSheet() { ui.sheet = null; renderSheet(); },
  sheet(d) {
    const i = d.i !== undefined ? Number(d.i) : undefined;
    ui.sheet = { type: d.type, i, id: d.id, hexkey: d.hexkey };
    renderSheet();
  },
  pickHero(d) { ui.heroPick = d.id; render(); },
  newGame() {
    const seed = (Math.random() * 0x7fffffff) | 0;
    startGame(E.newGame(seed, ui.heroPick));
  },
  continue() { startGame(loadSave()); },
  toTitle() { if (G && G.phase === 'over') { G = null; save(); } G = null; ui.sheet = null; render(); },
  abandon() { G = null; save(); ui.sheet = null; render(); },
  undo,
  center() { ui.lastPos = null; applyView(); },
  play(d) { dispatch({ type: 'play', index: Number(d.i), mode: d.mode }); },
  unit(d) { dispatch({ type: 'unit', index: Number(d.i), ability: Number(d.ability) }); },
  skill(d) { dispatch({ type: 'skill', id: d.id }); },
  healUnit(d) { dispatch({ type: 'healUnit', index: Number(d.i) }); },
  healWound() { dispatch({ type: 'healWound' }); },
  dismiss(d) { dispatch({ type: 'dismiss', index: Number(d.i) }); },
  attack(d) { ui.sel = []; dispatch({ type: 'attack', hex: d.hexkey }); },
  foe(d) {
    const i = Number(d.i);
    const cb = G.combat;
    if (!cb) return;
    if (cb.phase === 'guard') {
      const en = cb.enemies[i];
      if (!en.defeated && !en.snared && !en.guarded) ui.guardSel = i;
    } else if (E.canTarget(G, i)) {
      ui.sel = ui.sel.includes(i) ? ui.sel.filter((x) => x !== i) : [...ui.sel, i];
    } else if (!cb.enemies[i].defeated && cb.phase === 'volley') toast('Warded: cannot be targeted in the Volley');
    render();
  },
  strike() { const t = [...ui.sel]; ui.sel = []; if (!dispatch({ type: 'strike', targets: t })) ui.sel = t; },
  guard() { dispatch({ type: 'guard', enemy: ui.guardSel }); },
  assign(d) { dispatch({ type: 'assign', enemy: Number(d.i), target: d.target === 'hero' ? 'hero' : Number(d.target) }); },
  next() { dispatch({ type: 'next' }); },
  recruit(d) { dispatch({ type: 'recruit', id: d.id }, { keepSheet: true }); },
  buy(d) { dispatch({ type: 'buy', id: d.id }, { keepSheet: true }); },
  buyHeal() { dispatch({ type: 'buyHeal' }, { keepSheet: true }); },
  recover(d) { dispatch({ type: 'recover', index: Number(d.i) }); },
  choose(d) { dispatch({ type: 'choose', index: Number(d.i) }, { keepSheet: true }); },
  endTurn() {
    const why = E.endTurnBlocker(G);
    if (why) { toast(why); return; }
    dispatch({ type: 'endTurn' });
  },
  endRound() { dispatch({ type: 'endRound' }); },
  concede() { ui.sheet = { type: 'concede' }; renderSheet(); },
};

function startGame(state) {
  G = state;
  history = [];
  ui.sheet = null; ui.view = null; ui.lastPos = null; ui.sel = [];
  save();
  render();
}

document.addEventListener('click', (e) => {
  const el = e.target.closest('[data-act]');
  if (!el) return;
  const fn = ACTS[el.dataset.act];
  if (el.disabled || !fn) return;
  e.preventDefault();
  fn(el.dataset);
});

// map pan, pinch and tap
const pointers = new Map();
let drag = null;
document.addEventListener('pointerdown', (e) => {
  if (!e.target.closest || !e.target.closest('svg.map')) return;
  pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
  if (pointers.size === 1) drag = { x: e.clientX, y: e.clientY, moved: false, cx: ui.view.cx, cy: ui.view.cy };
  else if (pointers.size === 2) {
    const [a, b] = [...pointers.values()];
    drag = { pinch: Math.hypot(a.x - b.x, a.y - b.y), k: ui.view.k, moved: true };
  }
});
document.addEventListener('pointermove', (e) => {
  if (!drag || !pointers.has(e.pointerId)) return;
  pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
  if (drag.pinch) {
    if (pointers.size < 2) return;
    const [a, b] = [...pointers.values()];
    ui.view.k = Math.max(0.55, Math.min(2.2, drag.k * (Math.hypot(a.x - b.x, a.y - b.y) / drag.pinch)));
  } else {
    const dx = e.clientX - drag.x; const dy = e.clientY - drag.y;
    if (Math.abs(dx) + Math.abs(dy) > 8) drag.moved = true;
    if (drag.moved) { ui.view.cx = drag.cx - dx / ui.view.k; ui.view.cy = drag.cy - dy / ui.view.k; }
  }
  applyView();
});
function endPointer(e) {
  if (!pointers.has(e.pointerId)) return;
  pointers.delete(e.pointerId);
  if (drag && !drag.moved && e.type === 'pointerup') {
    const el = document.elementFromPoint(e.clientX, e.clientY);
    const hex = el && el.closest && el.closest('[data-hex]');
    if (hex) onHexTap(hex.dataset.hex);
  }
  if (pointers.size === 0) drag = null;
}
document.addEventListener('pointerup', endPointer);
document.addEventListener('pointercancel', endPointer);
window.addEventListener('resize', () => { if (G) render(); });

// ---------- development helpers (query parameters)
function devScenario(name, s) {
  const near = E.neighbors(s.hero.pos).find((n) => s.map[n]);
  const put = (type, enemies, extra = {}) => { s.map[near].terrain = 'plains'; s.map[near].revealed = true; s.map[near].site = { type, enemies, seen: true, ...extra }; };
  if (name === 'combat' || name === 'guard' || name === 'damage' || name === 'strike') {
    put('camp', ['wolf_riders', 'cinder_hounds']);
    s.hero.units.push({ id: 'shieldmaidens', spent: false, wounded: false });
    s.hero.hand = ['hunters_shot', 'shieldwork', 'hewing_blow', 'cinder_lash', 'sidestep', 'steady_hand'];
    E.act(s, { type: 'attack', hex: near });
    if (name !== 'combat') E.act(s, { type: 'next' });
    if (name === 'damage' || name === 'strike') E.act(s, { type: 'next' });
    if (name === 'strike') { E.act(s, { type: 'assign', enemy: 0, target: 0 }); E.act(s, { type: 'assign', enemy: 1, target: 'hero' }); }
  } else if (name === 'citadel') {
    put('citadel', ['ashen_tyrant', 'dread_knight', 'ash_seer']);
    s.hero.hand = ['firestorm', 'wyrmtooth', 'aegis', 'pyre_wave', 'hewing_blow', 'whiteout', 'shieldwork', 'wound'];
    s.hero.shards = { ember: 2, frost: 1, verdant: 0, radiant: 1 };
    E.act(s, { type: 'attack', hex: near });
  } else if (name === 'shop') {
    s.map[s.hero.pos].site = { type: 'sanctum', enemies: [], seen: true };
    s.offers.units = ['healer', 'acolytes', 'wardens'];
    s.hero.hand = ['fair_words', 'rallying_banner', 'wound', 'trailcraft', 'attune'];
    s.hero.command = 2;
    s.hero.units.push({ id: 'levy', spent: true, wounded: false });
    s.hero.skills.push('battle_rhythm');
    E.act(s, { type: 'play', index: 1, mode: 'strong' });
  } else if (name === 'reward') {
    s.pending.push({ type: 'reward', kind: 'relic', options: s.decks.relics.splice(0, 2) });
  } else if (name === 'levelup') {
    s.hero.renown = 2;
    put('camp', ['ash_goblins']);
    s.hero.hand = ['hewing_blow', 'hewing_blow', 'trailcraft'];
    E.act(s, { type: 'attack', hex: near });
    E.act(s, { type: 'next' }); E.act(s, { type: 'next' });
    E.act(s, { type: 'assign', enemy: 0, target: 'hero' });
    E.act(s, { type: 'play', index: 0, mode: 'basic' }); E.act(s, { type: 'play', index: 0, mode: 'basic' });
    E.act(s, { type: 'strike', targets: [0] });
  } else if (name === 'night') {
    s.round = 2; s.night = true;
    for (const h of Object.values(s.map)) if (h.row >= 4) h.revealed = true;
    s.hero.hand = [...s.hero.hand, 'wound', 'pyre_wave', 'mistwalk'];
  } else if (name === 'explored') {
    for (const h of Object.values(s.map)) { h.revealed = true; if (h.site) h.site.seen = true; }
    s.turn.move = 4;
  } else if (name === 'won') {
    s.over = { won: true, score: 57 }; s.phase = 'over';
  }
}

async function boot() {
  try { VERSION = (await import('./version.mjs')).VERSION; } catch { /* dev */ }
  const q = new URLSearchParams(location.search);
  if (q.has('seed') || q.has('dev') || q.has('auto')) {
    const s = E.newGame(Number(q.get('seed') || 7), q.get('hero') || 'kaela');
    if (q.has('auto')) {
      const bots = await import('../tests/helpers.mjs');
      for (let i = 0; i < Number(q.get('auto')) && s.phase !== 'over'; i++) bots.smartTurn(s);
    }
    if (q.has('dev')) devScenario(q.get('dev'), s);
    G = s;
    ui.view = null;
  }
  render();
  if (q.has('sheet')) { ui.sheet = { type: q.get('sheet'), i: Number(q.get('i') || 0), id: q.get('id'), hexkey: q.get('hexkey') || (G && G.hero.pos) }; renderSheet(); }
  if (q.has('click')) {
    for (const sel of q.get('click').split(';')) {
      if (sel.startsWith('hex:')) { onHexTap(sel.slice(4)); continue; }
      const el = document.querySelector(sel);
      if (el) el.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      else console.warn('click: no element', sel);
      await new Promise((r) => setTimeout(r, 30));
    }
  }
  if ('serviceWorker' in navigator && location.protocol === 'https:') {
    const hadController = !!navigator.serviceWorker.controller;
    let reloaded = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (hadController && !reloaded) { reloaded = true; location.reload(); }
    });
    navigator.serviceWorker.register('sw.js', { updateViaCache: 'none' }).then((reg) => reg.update()).catch(() => {});
  }
}
boot();
