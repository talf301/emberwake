// Balance read-out: node tools/sim.js [games]
import { playSmart } from '../tests/helpers.mjs';
const n = Number(process.argv[2] || 200);
let wins = 0; const lv = []; const rounds = []; const renown = []; const wounds = [];
for (let seed = 1; seed <= n; seed++) {
  const s = playSmart(seed, seed % 2 ? 'kaela' : 'orrin');
  if (s.over && s.over.won) { wins++; rounds.push(s.round); }
  lv.push(s.hero.level); renown.push(s.hero.renown);
  const h = s.hero; wounds.push([...h.deck, ...h.hand, ...h.discard].filter((c) => c === 'wound').length);
}
const avg = (a) => (a.reduce((x, y) => x + y, 0) / (a.length || 1)).toFixed(2);
console.log(`games ${n}  wins ${wins} (${(100 * wins / n).toFixed(0)}%)  avg level ${avg(lv)}  avg renown ${avg(renown)}  avg wounds ${avg(wounds)}  avg win round ${avg(rounds)}`);
