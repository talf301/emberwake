// Emberwake game content. Pure data, no logic.
//
// Effect atoms (interpreted by engine.js):
//   {move:n} {sway:n} {heal:n} {draw:n}
//   {attack:n, el} {ranged:n, el} {siege:n, el}   el: 'phys' | 'ember' | 'frost'
//   {block:n, el}                                 el: 'phys' | 'ember' | 'frost' | 'pure'
//   {essence:'any'|aspect, n} {shard:'any'|aspect, n}
//   {ready:1} {readyAll:true} {snare:maxAttack|99} {weaken:n} {wound:n}
//   {flat:n}  (every passable terrain costs n this turn)
//   {standing:n}
//   {dayBonus:{...atom}} {nightBonus:{...atom}}
//   {choice:[[atoms],[atoms]]}
// An effect is an array of atoms.

export const ASPECTS = ['ember', 'frost', 'verdant', 'radiant'];

export const ASPECT_INFO = {
  ember: { name: 'Ember', color: '#e2552d', dark: '#5e1c0e', glyph: 'flame' },
  frost: { name: 'Frost', color: '#4aa8e0', dark: '#123a5c', glyph: 'crystal' },
  verdant: { name: 'Verdant', color: '#5fae4a', dark: '#1d4420', glyph: 'leaf' },
  radiant: { name: 'Radiant', color: '#e6c15a', dark: '#5c4712', glyph: 'sun' },
  relic: { name: 'Relic', color: '#b58cd9', dark: '#3a2452', glyph: 'gem' },
  wound: { name: 'Wound', color: '#8a2a2a', dark: '#2a0c0c', glyph: 'wound' },
};

const c = (id, name, aspect, kind, basic, strong, extra = {}) => ({
  id, name, aspect, kind, basic, strong, ...extra,
});

// kind: 'basic' (starter), 'advanced', 'arcana' (basic costs 1 essence, strong 2),
//       'relic' (strong = unleash, destroys the card), 'wound'
export const CARDS = Object.fromEntries([
  // ---- starters
  c('hewing_blow', 'Hewing Blow', 'ember', 'basic', [{ attack: 2 }], [{ attack: 4 }], { art: 'sword' }),
  c('forced_march', 'Forced March', 'ember', 'basic', [{ move: 3 }], [{ move: 5 }], { art: 'boot' }),
  c('shieldwork', 'Shieldwork', 'radiant', 'basic', [{ block: 3 }], [{ block: 5 }], { art: 'shield' }),
  c('fair_words', 'Fair Words', 'radiant', 'basic', [{ sway: 2 }], [{ sway: 4 }], { art: 'scroll' }),
  c('steady_hand', 'Steady Hand', 'radiant', 'basic',
    [{ choice: [[{ attack: 2 }], [{ block: 2 }]] }],
    [{ choice: [[{ attack: 3 }], [{ block: 4 }]] }], { art: 'hand' }),
  c('trailcraft', 'Trailcraft', 'verdant', 'basic', [{ move: 2 }], [{ move: 4 }], { art: 'path' }),
  c('hunters_shot', "Hunter's Shot", 'verdant', 'basic', [{ ranged: 2 }], [{ ranged: 3 }], { art: 'bow' }),
  c('field_dressing', 'Field Dressing', 'verdant', 'basic', [{ heal: 1 }], [{ heal: 2 }, { draw: 1 }], { art: 'herb' }),
  c('attune', 'Attune', 'frost', 'basic',
    [{ essence: 'any', n: 1 }, { draw: 1 }], [{ shard: 'any', n: 1 }, { draw: 1 }], { art: 'eye' }),
  c('rime_dart', 'Rime Dart', 'frost', 'basic', [{ ranged: 1, el: 'frost' }], [{ ranged: 3, el: 'frost' }], { art: 'dart' }),
  c('sidestep', 'Sidestep', 'frost', 'basic',
    [{ choice: [[{ block: 2 }], [{ move: 1 }]] }], [{ block: 4, el: 'frost' }], { art: 'swirl' }),
  // hero signature cards
  c('cinder_lash', 'Cinder Lash', 'ember', 'basic', [{ attack: 3, el: 'ember' }], [{ attack: 5, el: 'ember' }], { art: 'whip', hero: 'kaela' }),
  c('pathfinder', 'Pathfinder', 'verdant', 'basic', [{ move: 3 }], [{ move: 4 }, { heal: 1 }], { art: 'compass', hero: 'orrin' }),

  // ---- advanced
  c('pyre_wave', 'Pyre Wave', 'ember', 'advanced', [{ attack: 4, el: 'ember' }], [{ attack: 7, el: 'ember' }], { art: 'wave' }),
  c('reckless_charge', 'Reckless Charge', 'ember', 'advanced', [{ attack: 5 }, { wound: 1 }], [{ attack: 8 }, { wound: 1 }], { art: 'charge' }),
  c('fire_lance', 'Fire Lance', 'ember', 'advanced', [{ ranged: 3, el: 'ember' }], [{ siege: 5, el: 'ember' }], { art: 'lance' }),
  c('battle_fury', 'Battle Fury', 'ember', 'advanced',
    [{ choice: [[{ attack: 3 }], [{ block: 3 }]] }], [{ attack: 5 }, { block: 3 }], { art: 'fury' }),

  c('ice_wall', 'Ice Wall', 'frost', 'advanced', [{ block: 5, el: 'frost' }], [{ block: 8, el: 'frost' }], { art: 'wall' }),
  c('glacial_spear', 'Glacial Spear', 'frost', 'advanced', [{ attack: 4, el: 'frost' }], [{ ranged: 5, el: 'frost' }], { art: 'spear' }),
  c('wellspring', 'Wellspring', 'frost', 'advanced', [{ shard: 'any', n: 1 }], [{ shard: 'any', n: 1 }, { shard: 'any', n: 1 }, { draw: 1 }], { art: 'well' }),
  c('foresight', 'Foresight', 'frost', 'advanced', [{ draw: 2 }], [{ draw: 3 }], { art: 'eye' }),

  c('windrunner', 'Windrunner', 'verdant', 'advanced', [{ move: 4 }], [{ move: 6 }], { art: 'wind' }),
  c('thornsnare', 'Thornsnare', 'verdant', 'advanced', [{ snare: 4 }], [{ snare: 99 }], { art: 'thorn' }),
  c('renewal', 'Renewal', 'verdant', 'advanced', [{ heal: 2 }], [{ heal: 3 }, { ready: 1 }], { art: 'herb' }),
  c('wild_bounty', 'Wild Bounty', 'verdant', 'advanced', [{ move: 2 }, { heal: 1 }], [{ move: 3 }, { heal: 1 }, { draw: 1 }], { art: 'leaf' }),

  c('rallying_banner', 'Rallying Banner', 'radiant', 'advanced', [{ sway: 4 }], [{ sway: 6 }, { standing: 1 }], { art: 'banner' }),
  c('aegis', 'Aegis', 'radiant', 'advanced', [{ block: 4, el: 'pure' }], [{ block: 7, el: 'pure' }], { art: 'shield' }),
  c('inspire', 'Inspire', 'radiant', 'advanced', [{ ready: 1 }], [{ ready: 1 }, { sway: 3 }, { draw: 1 }], { art: 'horn' }),
  c('sunlance', 'Sunlance', 'radiant', 'advanced',
    [{ ranged: 3 }, { dayBonus: { ranged: 2 } }], [{ siege: 4 }, { dayBonus: { siege: 2 } }], { art: 'sun' }),

  // ---- arcana (basic costs 1 essence of its aspect, overcast costs 2)
  c('firestorm', 'Firestorm', 'ember', 'arcana', [{ ranged: 5, el: 'ember' }], [{ siege: 8, el: 'ember' }], { art: 'storm' }),
  c('whiteout', 'Whiteout', 'frost', 'arcana', [{ snare: 99 }], [{ snare: 99 }, { attack: 4, el: 'frost' }], { art: 'snow' }),
  c('mistwalk', 'Mistwalk', 'frost', 'arcana', [{ flat: 2 }, { move: 4 }], [{ flat: 1 }, { move: 5 }], { art: 'mist' }),
  c('overgrowth', 'Overgrowth', 'verdant', 'arcana', [{ heal: 3 }, { move: 2 }], [{ heal: 5 }, { readyAll: true }], { art: 'tree' }),
  c('sanctuary', 'Sanctuary', 'radiant', 'arcana', [{ block: 7, el: 'pure' }], [{ block: 10, el: 'pure' }, { heal: 1 }], { art: 'dome' }),
  c('thunderclap', 'Thunderclap', 'radiant', 'arcana', [{ ranged: 4 }, { nightBonus: { ranged: 2 } }], [{ ranged: 7 }, { weaken: 2 }], { art: 'bolt' }),

  // ---- relics (strong = unleash: destroys the relic)
  c('wyrmtooth', 'Wyrmtooth Blade', 'relic', 'relic', [{ attack: 4 }], [{ attack: 10 }], { art: 'sword' }),
  c('mirror_shield', 'Mirror Shield', 'relic', 'relic', [{ block: 5, el: 'pure' }], [{ block: 12, el: 'pure' }], { art: 'shield' }),
  c('league_boots', 'Seven-League Boots', 'relic', 'relic', [{ move: 3 }], [{ flat: 1 }, { move: 7 }], { art: 'boot' }),
  c('vial_of_dawn', 'Vial of Dawn', 'relic', 'relic', [{ heal: 2 }], [{ heal: 6 }], { art: 'vial' }),
  c('prism', 'Wanderer’s Prism', 'relic', 'relic',
    [{ essence: 'any', n: 1 }, { essence: 'any', n: 1 }],
    [{ shard: 'ember', n: 1 }, { shard: 'frost', n: 1 }, { shard: 'verdant', n: 1 }, { shard: 'radiant', n: 1 }], { art: 'gem' }),
  c('war_horn', 'Horn of the Marches', 'relic', 'relic',
    [{ choice: [[{ sway: 3 }], [{ ready: 1 }]] }], [{ readyAll: true }, { sway: 3 }], { art: 'horn' }),

  c('wound', 'Wound', 'wound', 'wound', null, null, { art: 'wound' }),
].map((x) => [x.id, x]));

export const STARTER_DECK = [
  'hewing_blow', 'hewing_blow', 'forced_march', 'shieldwork', 'shieldwork',
  'fair_words', 'fair_words', 'steady_hand', 'trailcraft', 'trailcraft',
  'hunters_shot', 'field_dressing', 'attune', 'rime_dart', 'sidestep',
];

export const HEROES = {
  kaela: {
    id: 'kaela', name: 'Kaela Cinderblade', title: 'Exiled Flameguard',
    blurb: 'Strikes first and hardest. Begins with Cinder Lash and one Ember shard.',
    card: 'cinder_lash', shards: { ember: 1 }, color: '#e2552d',
  },
  orrin: {
    id: 'orrin', name: 'Orrin Wayfarer', title: 'Ranger of the Marches',
    blurb: 'Covers ground and mends as he goes. Begins with Pathfinder and one Verdant shard.',
    card: 'pathfinder', shards: { verdant: 1 }, color: '#5fae4a',
  },
};

// ---- enemies. traits: swift (block needs double), brutal (double damage),
// venom (wounds also go to discard; slays companions), warded (immune in volley phase)
const e = (id, name, group, armor, attack, renown, extra = {}) => ({
  id, name, group, armor, attack, renown, el: 'phys', resist: [], traits: [], ...extra,
});
export const ENEMIES = Object.fromEntries([
  e('ash_goblins', 'Ash Goblins', 'reaver', 3, 3, 2, { art: 'goblin' }),
  e('reaver_scouts', 'Reaver Scouts', 'reaver', 3, 2, 2, { traits: ['swift'], art: 'dagger' }),
  e('bog_troll', 'Bog Troll', 'reaver', 5, 4, 3, { art: 'troll' }),
  e('wolf_riders', 'Wolf Riders', 'reaver', 4, 3, 3, { traits: ['swift'], art: 'wolf' }),
  e('cinder_hounds', 'Cinder Hounds', 'reaver', 3, 4, 3, { el: 'ember', resist: ['ember'], art: 'hound' }),
  e('marsh_hag', 'Marsh Hag', 'reaver', 4, 3, 3, { traits: ['venom'], art: 'hag' }),

  e('pikemen', 'Pikemen', 'garrison', 4, 4, 3, { art: 'pike' }),
  e('crossbow_line', 'Crossbow Line', 'garrison', 3, 5, 3, { art: 'crossbow' }),
  e('ironclads', 'Ironclads', 'garrison', 3, 4, 4, { resist: ['phys'], art: 'helm' }),
  e('keep_captain', 'Keep Captain', 'garrison', 5, 3, 4, { traits: ['brutal'], art: 'captain' }),

  e('frost_adept', 'Frost Adept', 'arcanist', 4, 5, 4, { el: 'frost', resist: ['frost'], art: 'mage' }),
  e('pyromancer', 'Pyromancer', 'arcanist', 4, 6, 4, { el: 'ember', resist: ['ember'], art: 'mage' }),
  e('stone_golem', 'Stone Golem', 'arcanist', 4, 4, 4, { resist: ['phys'], art: 'golem' }),
  e('hex_weaver', 'Hex Weaver', 'arcanist', 5, 4, 5, { traits: ['venom'], art: 'hag' }),

  e('barrow_wight', 'Barrow Wight', 'horror', 5, 4, 4, { el: 'frost', resist: ['frost'], art: 'wight' }),
  e('bone_colossus', 'Bone Colossus', 'horror', 6, 4, 5, { traits: ['brutal'], art: 'skull' }),
  e('gloom_spider', 'Gloom Spider', 'horror', 4, 4, 4, { traits: ['swift', 'venom'], art: 'spider' }),
  e('shade', 'Shade', 'horror', 3, 4, 4, { resist: ['phys'], traits: ['warded'], art: 'shade' }),

  e('ember_wyrm', 'Ember Wyrm', 'wyrm', 7, 7, 7, { el: 'ember', resist: ['ember'], art: 'wyrm' }),
  e('rime_wyrm', 'Rime Wyrm', 'wyrm', 7, 6, 7, { el: 'frost', resist: ['frost'], traits: ['swift'], art: 'wyrm' }),

  e('dread_knight', 'Dread Knight', 'elite', 6, 5, 6, { traits: ['brutal'], art: 'helm' }),
  e('ash_seer', 'Ash Seer', 'elite', 5, 6, 6, { el: 'ember', resist: ['ember', 'frost'], art: 'mage' }),
  e('siege_ogre', 'Siege Ogre', 'elite', 8, 6, 6, { art: 'troll' }),
  e('ashen_tyrant', 'The Ashen Tyrant', 'boss', 9, 8, 10, { el: 'ember', resist: ['ember'], traits: ['warded'], art: 'crown' }),
].map((x) => [x.id, x]));

export const TRAIT_INFO = {
  swift: { name: 'Swift', text: 'Guarding against it needs twice its attack value.' },
  brutal: { name: 'Brutal', text: 'Unguarded, it deals twice its attack value.' },
  venom: { name: 'Venom', text: 'Each wound it causes puts a second wound in your discard. A companion that takes its damage is slain.' },
  warded: { name: 'Warded', text: 'Cannot be targeted in the Volley phase.' },
};

// ---- companions
const u = (id, name, cost, armor, abilities, sites, art) => ({ id, name, cost, armor, abilities, sites, art });
export const COMPANIONS = Object.fromEntries([
  u('levy', 'Peasant Levy', 3, 3, [[{ attack: 2 }], [{ block: 2 }], [{ move: 2 }]], ['village'], 'pitchfork'),
  u('scouts', 'Woodland Scouts', 4, 3, [[{ move: 3 }], [{ ranged: 2 }]], ['village'], 'bow'),
  u('healer', 'Hedge Healer', 5, 2, [[{ heal: 2 }], [{ block: 3 }]], ['village', 'sanctum'], 'herb'),
  u('shieldmaidens', 'Shieldmaidens', 6, 5, [[{ block: 4 }], [{ attack: 3 }]], ['village', 'keep'], 'shield'),
  u('acolytes', 'Ember Acolytes', 7, 3, [[{ attack: 4, el: 'ember' }], [{ ranged: 3, el: 'ember' }]], ['sanctum', 'keep'], 'flame'),
  u('wardens', 'Frost Wardens', 7, 4, [[{ block: 5, el: 'frost' }], [{ attack: 4, el: 'frost' }]], ['sanctum', 'keep'], 'crystal'),
  u('siege_crew', 'Siege Crew', 8, 4, [[{ siege: 5 }], [{ block: 2 }]], ['keep'], 'catapult'),
  u('knight', 'Knight Errant', 9, 6, [[{ attack: 5 }], [{ block: 5 }], [{ sway: 3 }]], ['keep', 'village'], 'helm'),
  u('sky_riders', 'Sky Riders', 9, 4, [[{ move: 4 }], [{ ranged: 4 }]], ['keep', 'sanctum'], 'wing'),
].map((x) => [x.id, x]));

// ---- skills. use: 'turn' (once per turn), 'round' (once per round), 'passive'
export const SKILLS = {
  battle_rhythm: { name: 'Battle Rhythm', use: 'turn', text: 'Once per turn: Attack 1 or Block 1.', effect: [{ choice: [[{ attack: 1 }], [{ block: 1 }]] }] },
  wayfinding: { name: 'Wayfinding', use: 'turn', text: 'Once per turn: Move 1.', effect: [{ move: 1 }] },
  silver_tongue: { name: 'Silver Tongue', use: 'turn', text: 'Once per turn: Sway 1.', effect: [{ sway: 1 }] },
  inner_fire: { name: 'Inner Fire', use: 'turn', text: 'Once per turn: gain 1 essence of any aspect.', effect: [{ essence: 'any', n: 1 }] },
  second_wind: { name: 'Second Wind', use: 'round', text: 'Once per round: Heal 2.', effect: [{ heal: 2 }] },
  insight: { name: 'Insight', use: 'round', text: 'Once per round: draw 2 cards.', effect: [{ draw: 2 }] },
  marksman: { name: 'Marksman', use: 'turn', text: 'Once per turn: Ranged Attack 1.', effect: [{ ranged: 1 }] },
  commander: { name: 'Commander', use: 'round', text: 'Once per round: ready a companion.', effect: [{ ready: 1 }] },
  thick_hide: { name: 'Thick Hide', use: 'passive', text: 'Armor +1.', passive: { armor: 1 } },
  quartermaster: { name: 'Quartermaster', use: 'passive', text: 'Hand limit +1.', passive: { hand: 1 } },
};

// renown needed to reach level index+2
export const LEVEL_THRESHOLDS = [3, 8, 15, 24, 35, 48, 63, 80];

// ---- terrain: cost [day, night]; null = impassable
export const TERRAIN = {
  plains: { name: 'Plains', cost: [2, 2] },
  forest: { name: 'Forest', cost: [3, 4] },
  hills: { name: 'Hills', cost: [3, 3] },
  marsh: { name: 'Marsh', cost: [4, 4] },
  wastes: { name: 'Ash Wastes', cost: [4, 3] },
  mountain: { name: 'Mountain', cost: [null, null] },
  lake: { name: 'Lake', cost: [null, null] },
};

export const SITES = {
  village: { name: 'Village', text: 'Recruit companions. Heal: 3 Sway per wound.' },
  sanctum: { name: 'Sanctum', text: 'Buy advanced cards for 6 Sway. Heal: 2 Sway per wound. Recruit.' },
  keep: { name: 'Keep', text: 'Walled garrison. Once taken: recruit here, and draw 1 extra card when you end a turn here.' },
  spire: { name: 'Spire', text: 'Walled arcanist. Once taken: learn one Arcana, then buy more for 8 Sway.' },
  barrow: { name: 'Barrow', text: 'A horror guards a relic.' },
  ruins: { name: 'Ruins', text: 'Two foes guard a relic and two shards.' },
  vein: { name: 'Shard Vein', text: 'End your turn here to gain a shard of its aspect.' },
  wayshrine: { name: 'Wayshrine', text: 'First visit: Heal 1 and draw 1 card.' },
  camp: { name: 'Reaver Camp', text: 'Marauders. Attack them from an adjacent hex. Leaving a hex next to them costs +1 Move.' },
  lair: { name: 'Wyrm Lair', text: 'A wyrm. Attack it from an adjacent hex. Leaving a hex next to it costs +1 Move.' },
  citadel: { name: 'The Ashen Citadel', text: 'Walled. Defeat the Tyrant and his guard to win.' },
};

export const RULES = {
  rounds: 6,
  turnsPerRound: 8,
  shardCap: 3,
  advancedCost: 6,
  arcanaCost: 8,
  villageHeal: 3,
  sanctumHeal: 2,
};
