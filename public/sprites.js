// Sprites próprios em pixel art (8x12), desenhados a partir de mapas de caracteres.
const FRONT = [
  '..HHHH..', '.HHHHHH.', '.HSSSSH.', '.SESSES.', '.SSSSSS.', '..SSSS..',
  '.CCLCCC.', 'CCCCCCCC', 'KCCCCCCK', '.PPPPPP.', '.PP..PP.', '.BB..BB.',
];
const FRONT_WALK = [...FRONT.slice(0, 10), '..PP.PP.', '..BB.BB.'];
const BACK = [
  '..HHHH..', '.HHHHHH.', '.HHHHHH.', '.HHHHHH.', '.SHHHHS.', '..SSSS..',
  '.CCCCCC.', 'CCCCCCCC', 'KCCCCCCK', '.PPPPPP.', '.PP..PP.', '.BB..BB.',
];
const BACK_WALK = [...BACK.slice(0, 10), '..PP.PP.', '..BB.BB.'];
const TYPE_A = [...BACK.slice(0, 7), 'KCCCCCCK', '.CCCCCC.', '.PPPPPP.', '.PP..PP.', '........'];
const TYPE_B = [...BACK.slice(0, 7), 'CKCCCCKC', '.CCCCCC.', '.PPPPPP.', '.PP..PP.', '........'];
const SIT = [...BACK.slice(0, 8), 'KCCCCCCK', '.PPPPPP.', '.PP..PP.', '........'];
const HAND = [
  '..HHHH.K', '.HHHHHHC', '.HSSSSHC', '.SESSESC', '.SSSSSSC', '..SSSS.C',
  '.CCLCCCC', 'CCCCCCC.', 'KCCCCCC.', '.PPPPPP.', '.PP..PP.', '.BB..BB.',
];
const HAND_B = HAND.map((r, i) => (i === 0 ? '..HHHH..' : i === 1 ? '.HHHHHHK' : r));
export const FRAMES = { FRONT, FRONT_WALK, BACK, BACK_WALK, TYPE_A, TYPE_B, SIT, HAND, HAND_B };

const SHIRTS = ['#4f8cff', '#3ecf8e', '#f2c14e', '#a77bff', '#ff7aa8', '#44c2d6', '#9bd16a', '#ff9f5a', '#7d8cff', '#e8e3d0', '#5cc8a8', '#c98bff'];
const HAIR = ['#2b1d16', '#5a3a22', '#c9a26b', '#1c1c24', '#8a3b2b', '#e6d5b8', '#4a4a58', '#d0603a'];
const SKIN = ['#f1c9a5', '#d9a27c', '#b97a56', '#8d5a3b', '#f6d7c3'];
const PANTS = ['#2d3350', '#3a2f45', '#24343a', '#40384a'];

export function hash(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}

const shade = (hex, k) => {
  const n = parseInt(hex.slice(1), 16);
  const f = (v) => Math.max(0, Math.min(255, Math.round(v * k)));
  return `rgb(${f(n >> 16)},${f((n >> 8) & 255)},${f(n & 255)})`;
};

export function paletteFor(kind, seed) {
  const h = hash(seed);
  if (kind === 'god') return { H: '#f4f1e4', S: '#ffe0bd', K: '#ffe0bd', E: '#1a1424', C: '#fffaf0', L: '#ffd166', P: '#f4efe2', B: '#d9a83a' };
  if (kind === 'codex') return { H: '#14203a', S: SKIN[(h >>> 8) % SKIN.length], K: SKIN[(h >>> 8) % SKIN.length], E: '#1a1424', C: '#24467f', L: '#ffd166', P: '#14203a', B: '#0b0e1a' };
  const shirt = kind === 'claude' ? '#d97757' : SHIRTS[h % SHIRTS.length];
  return {
    H: kind === 'intern' ? '#ffd166' : HAIR[(h >>> 4) % HAIR.length],
    S: SKIN[(h >>> 8) % SKIN.length],
    K: SKIN[(h >>> 8) % SKIN.length],
    E: '#1a1424',
    C: shirt,
    L: kind === 'intern' ? '#ffd166' : kind === 'claude' ? '#fff1e0' : shade(shirt, 0.8),
    P: PANTS[(h >>> 12) % PANTS.length],
    B: '#1a1420',
  };
}

const cache = new Map();
export function sprite(frame, pal, dim = 1) {
  const key = frame + '|' + Object.values(pal).join(',') + '|' + dim;
  let c = cache.get(key);
  if (c) return c;
  const rows = FRAMES[frame];
  c = document.createElement('canvas');
  c.width = 8; c.height = 12;
  const g = c.getContext('2d');
  rows.forEach((row, y) => {
    for (let x = 0; x < 8; x++) {
      const ch = row[x];
      if (ch === '.') continue;
      g.fillStyle = dim < 1 ? shade(toHex(pal[ch]), dim) : pal[ch];
      g.fillRect(x, y, 1, 1);
    }
  });
  if (cache.size > 2000) cache.clear();
  cache.set(key, c);
  return c;
}

function toHex(c) {
  if (c.startsWith('#')) return c;
  const m = c.match(/\d+/g).map(Number);
  return '#' + m.slice(0, 3).map((v) => v.toString(16).padStart(2, '0')).join('');
}

// Ícones 5x5 para os balões
export const ICONS = {
  'editando': ['....#', '...#.', '..#..', '.#...', '##...'],
  'lendo': ['##.##', '#.#.#', '#.#.#', '#.#.#', '##.##'],
  'rodando comando': ['#....', '.#...', '#....', '.....', '..###'],
  'pesquisando na web': ['.###.', '#.#.#', '#####', '#.#.#', '.###.'],
  'delegando': ['..#..', '...#.', '#####', '...#.', '..#..'],
  'pensando': ['.....', '.....', '#.#.#', '.....', '.....'],
  'usando skill': ['..#..', '.###.', '#####', '.###.', '..#..'],
  'usando integração': ['.#.#.', '.#.#.', '#####', '.###.', '..#..'],
  'planejando': ['#.###', '.....', '#.###', '.....', '#.###'],
  'publicando': ['..#..', '.###.', '..#..', '..#..', '#####'],
  'agendando': ['#####', '#.#.#', '#####', '#...#', '#####'],
  'trabalhando': ['.###.', '#...#', '#.#.#', '#...#', '.###.'],
  'perguntando pra você': ['.###.', '#...#', '..##.', '.....', '..#..'],
  'aguardando você': ['..#..', '..#..', '..#..', '.....', '..#..'],
  'sem resposta': ['####.', '..#..', '.#...', '####.', '.....'],
  'auditando': ['.##..', '#..#.', '#..#.', '.###.', '....#'],
  'de plantão': ['.###.', '#...#', '#.#.#', '#...#', '.###.'],
};

export const ACTIVITY_COLOR = {
  'editando': '#5fe0a8', 'lendo': '#6cc6ff', 'rodando comando': '#ffb547', 'pesquisando na web': '#44d6e0',
  'delegando': '#a98bff', 'pensando': '#e9e6d8', 'usando skill': '#ff9fd0', 'usando integração': '#9bd16a',
  'planejando': '#f2c14e', 'publicando': '#ff9f5a', 'agendando': '#c6b6ff', 'trabalhando': '#e9e6d8',
  'auditando': '#9fc1ff', 'de plantão': '#9fc1ff', 'perguntando pra você': '#ff6b5e', 'aguardando você': '#ff6b5e', 'sem resposta': '#8f95b8',
};
