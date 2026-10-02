/* WikiZizi — un jeu de cartes à collectionner tiré de Wikipédia.
 * Tout tourne dans le navigateur : les cartes viennent de l'API publique
 * de fr.wikipedia.org et la partie est sauvegardée dans localStorage. */
'use strict';

// ---------------------------------------------------------------- Config

const API = 'https://fr.wikipedia.org/w/api.php';
const SAVE_KEY = 'wikizizi.save.v1';

const REGEN_MS = 10 * 60 * 1000;  // un booster toutes les 10 minutes
const STOCK_MAX = 10;
const BOOSTER_SIZE = 5;
const MULTI_MAX = 10;              // « Tout ouvrir » ouvre au plus 10 boosters
const HISTORY_MAX = 15;
const MARKET_TTL = 30 * 60 * 1000;
const MARKET_REFRESH_PRICE = 10;
const POPULAR_TTL = 6 * 60 * 60 * 1000;

// Rareté selon le nombre de vues de la page sur 30 jours.
const RARITIES = [
  { id: 'commune',      name: 'Commune',      min: 0,     sell: 1 },
  { id: 'peu-commune',  name: 'Peu commune',  min: 50,    sell: 2 },
  { id: 'rare',         name: 'Rare',         min: 200,   sell: 5 },
  { id: 'super-rare',   name: 'Super rare',   min: 1000,  sell: 15 },
  { id: 'ultra-rare',   name: 'Ultra rare',   min: 5000,  sell: 40 },
  { id: 'legendaire',   name: 'Légendaire',   min: 20000, sell: 120 },
];

/* Types de boosters.
 * luck : multiplie les chances qu'un emplacement soit une page populaire
 *        (souvent ultra rare / légendaire) ou une page liée à une page
 *        populaire (souvent rare / super rare).
 * cat  : catégorie Wikipédia d'où viennent les pages (boosters thématiques).
 * sure : nombre d'emplacements garantis « page liée à une page populaire ». */
const PACKS = [
  { id: 'classique', name: 'Classique',  ico: 'W',  price: 25,  luck: 1,
    desc: '5 pages tirées au hasard dans tout Wikipédia.', colors: ['#7c6cff', '#ff5dc8', '#ffcc4d'] },
  { id: 'premium',   name: 'Premium',    ico: '★',  price: 100, luck: 3, sure: 1,
    desc: 'Beaucoup plus de pages célèbres. Une carte « connue » garantie.', colors: ['#1a1405', '#b8860b', '#ffe680'] },
  { id: 'histoire',  name: 'Histoire',   ico: '🏛️', price: 40,  luck: 0.5, cat: 'Portail:Histoire/Articles liés',
    desc: 'Rois, batailles, empires et révolutions.', colors: ['#5a2d0c', '#b5651d', '#f3d29b'] },
  { id: 'sciences',  name: 'Sciences',   ico: '🔬', price: 40,  luck: 0.5, cat: 'Portail:Sciences/Articles liés',
    desc: 'Physique, chimie, biologie, mathématiques…', colors: ['#063a4f', '#0f8bb3', '#8ff0ff'] },
  { id: 'geo',       name: 'Géographie', ico: '🌍', price: 40,  luck: 0.5, cat: 'Portail:Géographie/Articles liés',
    desc: 'Pays, villes, fleuves et montagnes.', colors: ['#0b3d1e', '#1f9d55', '#b8f5c9'] },
  { id: 'sport',     name: 'Sport',      ico: '⚽', price: 40,  luck: 0.5, cat: 'Portail:Sport/Articles liés',
    desc: 'Athlètes, clubs et compétitions.', colors: ['#4a0b0b', '#d63a3a', '#ffc2a8'] },
  { id: 'arts',      name: 'Arts',       ico: '🎨', price: 40,  luck: 0.5, cat: 'Portail:Arts/Articles liés',
    desc: 'Peintres, œuvres, musées et courants.', colors: ['#3b0b4a', '#a83ad6', '#ffb8f0'] },
  { id: 'musique',   name: 'Musique',    ico: '🎵', price: 40,  luck: 0.5, cat: 'Portail:Musique/Articles liés',
    desc: 'Artistes, albums, instruments et genres.', colors: ['#0d1440', '#3a55d6', '#a8d8ff'] },
  { id: 'jv',        name: 'Jeu vidéo',  ico: '🎮', price: 40,  luck: 0.5, cat: 'Portail:Jeu vidéo/Articles liés',
    desc: 'Jeux, consoles et studios.', colors: ['#10240d', '#3ad63a', '#e4ff8a'] },
];
// Booster secret, obtenu uniquement avec un code : que des cartes Ultra rares ou Légendaires.
PACKS.push({ id: 'legendaire', name: 'Légendaire', ico: '👑', price: 0, luck: 1, elite: true,
  desc: 'Booster secret : uniquement des cartes Ultra rares et Légendaires.', colors: ['#1a0533', '#7b2ff7', '#ffd23f'] });
const packById = id => PACKS.find(p => p.id === id) || PACKS[0];

const ACHIEVEMENTS = [
  { id: 'first',    ico: '🎁', name: 'Premier booster',      desc: 'Ouvrir ton premier booster',       test: s => s.stats.opened >= 1 },
  { id: 'c10',      ico: '📗', name: 'Lecteur curieux',      desc: '10 cartes différentes',            test: s => uniqueCount(s) >= 10 },
  { id: 'c50',      ico: '📘', name: 'Encyclopédiste',       desc: '50 cartes différentes',            test: s => uniqueCount(s) >= 50 },
  { id: 'c150',     ico: '📕', name: 'Bibliothécaire',       desc: '150 cartes différentes',           test: s => uniqueCount(s) >= 150 },
  { id: 'c500',     ico: '🏛️', name: 'Grand WikiZizi',     desc: '500 cartes différentes',           test: s => uniqueCount(s) >= 500 },
  { id: 'rare',     ico: '🔷', name: 'Ça devient sérieux',   desc: 'Obtenir une carte Rare',           test: s => hasTier(s, 2) },
  { id: 'super',    ico: '💜', name: 'Super !',              desc: 'Obtenir une carte Super rare',     test: s => hasTier(s, 3) },
  { id: 'ultra',    ico: '🔥', name: 'Ultra instinct',       desc: 'Obtenir une carte Ultra rare',     test: s => hasTier(s, 4) },
  { id: 'legend',   ico: '👑', name: 'Légende vivante',      desc: 'Obtenir une carte Légendaire',     test: s => hasTier(s, 5) },
  { id: 'open50',   ico: '📦', name: 'Accro aux boosters',   desc: 'Ouvrir 50 boosters',               test: s => s.stats.opened >= 50 },
  { id: 'open200',  ico: '🏭', name: 'Usine à cartes',       desc: 'Ouvrir 200 boosters',              test: s => s.stats.opened >= 200 },
  { id: 'themes',   ico: '🧭', name: 'Touche-à-tout',        desc: 'Ouvrir un booster de chaque thème', test: s => PACKS.filter(p => p.cat).every(p => s.stats.packs?.[p.id]) },
  { id: 'godpack',  ico: '🌟', name: 'Pack divin',           desc: 'Deux Légendaires dans un même booster', test: s => s.stats.godpack >= 1 },
  { id: 'rich',     ico: '💰', name: 'Wikizgeg-illionnaire', desc: 'Posséder 5 000 wikizgeg',         test: s => s.money >= 5000 },
  { id: 'trader',   ico: '🏪', name: 'Marchand',             desc: 'Acheter 5 cartes au marché',       test: s => s.stats.bought >= 5 },
];

// ---------------------------------------------------------------- State

const now = () => Date.now();

function freshState() {
  return {
    money: 500,
    stock: STOCK_MAX,   // on commence avec le stock plein
    welcome10: true,
    lastRegen: now(),
    cards: {},          // pageid -> carte
    market: { offers: [], at: 0 },
    stats: { opened: 0, sold: 0, bought: 0, earned: 0, godpack: 0, packs: {}, pulls: [0, 0, 0, 0, 0, 0] },
    history: [],
    pack: 'classique',
    achievements: {},
  };
}

let state = load();
save();
let popular = { titles: [], counts: new Map(), at: 0 };   // non sauvegardé

function load() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (raw) {
      const s = JSON.parse(raw);
      const base = freshState();
      const merged = { ...base, ...s, stats: { ...base.stats, ...s.stats }, market: s.market || base.market };
      // Les parties commencées avant le départ à 10 boosters reçoivent une fois le stock plein.
      if (!s.welcome10) { merged.stock = STOCK_MAX; merged.lastRegen = Date.now(); merged.welcome10 = true; }
      return merged;
    }
  } catch (e) { /* stockage indisponible : on repart de zéro */ }
  return freshState();
}

function save() {
  try { localStorage.setItem(SAVE_KEY, JSON.stringify(state)); } catch (e) { /* ignore */ }
}

const uniqueCount = s => Object.keys(s.cards).length;
const hasTier = (s, t) => Object.values(s.cards).some(c => tierOf(c) >= t);

// ---------------------------------------------------------------- Helpers

const $ = sel => document.querySelector(sel);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const pick = arr => arr[Math.floor(Math.random() * arr.length)];
const shuffle = arr => { const a = [...arr]; for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
const fmt = n => new Intl.NumberFormat('fr-FR').format(n);
const sleep = ms => new Promise(r => setTimeout(r, ms));

function hash(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}

function tierOf(card) {
  let t = 0;
  RARITIES.forEach((r, i) => { if (card.v >= r.min) t = i; });
  return t;
}
const rarityOf = card => RARITIES[tierOf(card)];

function toast(msg, kind = '') {
  const el = document.createElement('div');
  el.className = 'toast ' + kind;
  el.innerHTML = msg;
  const box = $('#toasts');
  box.appendChild(el);
  while (box.children.length > 4) box.firstChild.remove();
  setTimeout(() => el.remove(), 3800);
}

function addMoney(n) {
  state.money += n;
  if (n > 0) state.stats.earned += n;
  const w = $('.wallet');
  w.classList.remove('bump'); void w.offsetWidth; w.classList.add('bump');
  renderWallet();
}

// ---------------------------------------------------------------- Wikipédia

async function api(params) {
  const url = new URL(API);
  const all = { action: 'query', format: 'json', formatversion: 2, origin: '*', ...params };
  for (const [k, v] of Object.entries(all)) url.searchParams.set(k, v);
  const res = await fetch(url);
  if (!res.ok) throw new Error('HTTP ' + res.status);
  const data = await res.json();
  if (data.error) throw new Error(data.error.info);
  return data;
}

const DETAIL_PARAMS = {
  prop: 'extracts|pageimages|pageviews|info|pageprops',
  exintro: 1, explaintext: 1, exlimit: 'max',
  piprop: 'thumbnail', pithumbsize: 400, pilimit: 'max', pilicense: 'any',
  pvipdays: 30,
  ppprop: 'disambiguation',
  redirects: 1,
};

function toCard(p) {
  if (!p || p.missing || p.invalid || p.ns !== 0) return null;
  if (p.pageprops && 'disambiguation' in p.pageprops) return null;
  const extract = (p.extract || '').replace(/\s+/g, ' ').trim();
  if (extract.length < 40) return null;
  if (!p.thumbnail) return null;   // chaque carte doit avoir une image
  let v = Object.values(p.pageviews || {}).reduce((a, b) => a + (b || 0), 0);
  // vues absentes : on estime à partir du classement des pages les plus vues (vues d'un jour × 30)
  if (!v && popular.counts.has(p.title)) v = popular.counts.get(p.title) * 30;
  return {
    id: p.pageid,
    t: p.title,
    x: extract.length > 900 ? extract.slice(0, 900).replace(/\s\S*$/, '') + '…' : extract,
    img: p.thumbnail.source,
    v,
    len: p.length || 0,
  };
}

/* Récupère le détail de pages (titres ou ids). L'API peut renvoyer les vues,
 * extraits ou images en plusieurs fois (« continue ») : on suit la suite et
 * on fusionne, sinon des pages très vues passeraient pour des communes. */
async function fetchDetails(sel) {
  const pages = new Map();
  let cont = {};
  for (let i = 0; i < 10; i++) {
    const data = await api({ ...DETAIL_PARAMS, ...sel, ...cont });
    for (const p of data.query?.pages || []) {
      const key = p.pageid ?? p.title;
      const prev = pages.get(key);
      if (!prev) { pages.set(key, p); continue; }
      for (const [k, v] of Object.entries(p)) {
        if (k === 'pageviews' && prev.pageviews) Object.assign(prev.pageviews, v);
        else if (prev[k] === undefined) prev[k] = v;
      }
    }
    if (!data.continue) break;
    cont = data.continue;
  }
  return [...pages.values()].map(toCard).filter(Boolean);
}

async function detailsForTitles(titles) {
  const out = [];
  // les extraits sont limités à 20 pages par requête
  for (let i = 0; i < titles.length; i += 20) out.push(...await fetchDetails({ titles: titles.slice(i, i + 20).join('|') }));
  return out;
}

async function detailsForIds(ids) {
  return ids.length ? fetchDetails({ pageids: ids.slice(0, 20).join('|') }) : [];
}

async function randomCards(n) {
  const out = [];
  for (let guard = 0; out.length < n && guard < Math.ceil(n / 6) + 3; guard++) {
    const data = await api({ list: 'random', rnnamespace: 0, rnlimit: 20 });
    out.push(...await detailsForIds((data.query?.random || []).map(r => r.id)));
  }
  return out;
}

// Pages au hasard dans une catégorie (tri aléatoire de la recherche Wikipédia).
async function categoryCards(cat, n) {
  const out = [];
  for (let guard = 0; out.length < n && guard < Math.ceil(n / 6) + 3; guard++) {
    const data = await api({
      list: 'search', srsearch: `incategory:"${cat}"`, srsort: 'random', srnamespace: 0, srlimit: 20, srprop: '',
    });
    const ids = (data.query?.search || []).map(r => r.pageid);
    if (!ids.length) break;
    out.push(...await detailsForIds(ids));
  }
  return out;
}

// Pages très célèbres, en dernier recours si les classements de Wikipédia ne répondent pas.
const FAMOUS = [
  'France', 'Paris', 'Napoléon Ier', 'Emmanuel Macron', 'Kylian Mbappé', 'Charles de Gaulle', 'Seconde Guerre mondiale',
  'Première Guerre mondiale', 'Révolution française', 'Louis XIV', 'Victor Hugo', 'Molière', 'Jules César', 'Jeanne d\'Arc',
  'Albert Einstein', 'Marie Curie', 'Isaac Newton', 'Léonard de Vinci', 'Pablo Picasso', 'Vincent van Gogh', 'Claude Monet',
  'Wolfgang Amadeus Mozart', 'Ludwig van Beethoven', 'Johnny Hallyday', 'Édith Piaf', 'Michael Jackson', 'The Beatles',
  'Elvis Presley', 'Zinédine Zidane', 'Lionel Messi', 'Cristiano Ronaldo', 'Michael Jordan', 'Roger Federer', 'Rafael Nadal',
  'Tour de France', 'Jeux olympiques', 'Coupe du monde de football', 'Paris Saint-Germain Football Club', 'Olympique de Marseille',
  'Tour Eiffel', 'Château de Versailles', 'Musée du Louvre', 'La Joconde', 'Mont Saint-Michel', 'Notre-Dame de Paris',
  'États-Unis', 'Royaume-Uni', 'Allemagne', 'Italie', 'Espagne', 'Japon', 'Chine', 'Russie', 'Canada', 'Québec', 'Belgique',
  'Suisse', 'Brésil', 'Égypte antique', 'Rome antique', 'Grèce antique', 'Empire romain', 'Moyen Âge', 'Renaissance (période)',
  'Adolf Hitler', 'Joseph Staline', 'Winston Churchill', 'Abraham Lincoln', 'Barack Obama', 'Donald Trump', 'Vladimir Poutine',
  'Union européenne', 'Organisation des Nations unies', 'Lune', 'Soleil', 'Terre', 'Mars (planète)', 'Système solaire',
  'Trou noir', 'Big Bang', 'Dinosaures', 'Tyrannosaurus', 'Lion', 'Chat', 'Chien', 'Être humain', 'ADN', 'Covid-19',
  'Intelligence artificielle', 'Internet', 'Google', 'Apple', 'Microsoft', 'Facebook', 'YouTube', 'Wikipédia', 'Minecraft',
  'Pokémon', 'Super Mario', 'Nintendo', 'PlayStation', 'Fortnite', 'Harry Potter', 'Star Wars', 'Le Seigneur des anneaux',
  'Marvel Comics', 'Batman', 'Spider-Man', 'Astérix', 'Tintin', 'One Piece', 'Naruto', 'Dragon Ball', 'Walt Disney Company',
  'Titanic (film, 1997)', 'Game of Thrones', 'Les Simpson', 'Bible', 'Coran', 'Jésus de Nazareth', 'Bouddhisme', 'Islam',
  'Christianisme', 'Mathématiques', 'Philosophie', 'Platon', 'Aristote', 'Socrate', 'Jean-Paul Sartre', 'Sigmund Freud',
  'Charles Darwin', 'Christophe Colomb', 'Cléopâtre VII', 'Alexandre le Grand', 'Gengis Khan', 'Mahatma Gandhi',
  'Nelson Mandela', 'Martin Luther King', 'Che Guevara', 'Fidel Castro', 'Taylor Swift', 'Beyoncé', 'Rihanna', 'Eminem',
  'Daft Punk', 'Aya Nakamura', 'Stromae', 'Céline Dion', 'Omar Sy', 'Louis de Funès', 'Jean Dujardin', 'Marion Cotillard',
];

const NAMESPACE_RE = /^(Spécial|Special|Wikipédia|Fichier|Catégorie|Portail|Aide|Modèle|Utilisateur|Discussion|Projet|Référence|Module|Sujet|MediaWiki|Accueil)( [^:]*)?:|^Accueil$|^-$/;

// Classement officiel Wikimedia des pages les plus vues (un des 3 derniers jours).
async function restTopViewed() {
  for (let d = 1; d <= 3; d++) {
    const date = new Date(now() - d * 86400000);
    const ymd = [date.getUTCFullYear(), String(date.getUTCMonth() + 1).padStart(2, '0'), String(date.getUTCDate()).padStart(2, '0')].join('/');
    try {
      const res = await fetch(`https://wikimedia.org/api/rest_v1/metrics/pageviews/top/fr.wikipedia/all-access/${ymd}`);
      if (!res.ok) continue;
      const data = await res.json();
      const arts = data.items?.[0]?.articles || [];
      if (arts.length) return arts.map(a => ({ title: a.article.replace(/_/g, ' '), count: a.views || 0 }));
    } catch (e) { /* on essaie le jour d'avant */ }
  }
  return [];
}

async function popularTitles() {
  if (popular.titles.length && now() - popular.at < POPULAR_TTL) return popular.titles;
  let list = [];
  try {
    const data = await api({ list: 'mostviewed', pvimlimit: 500 });
    list = (data.query?.mostviewed || []).filter(p => p.ns === 0).map(p => ({ title: p.title, count: p.count || 0 }));
  } catch (e) { /* source suivante */ }
  if (list.length < 50) {
    const rest = await restTopViewed();
    if (rest.length) list = rest;
  }
  list = list.filter(p => !NAMESPACE_RE.test(p.title)).slice(0, 500);
  if (list.length < 50) {
    // dernier recours : la liste intégrée (on ne la met pas en cache pour retenter les classements plus tard)
    const famous = FAMOUS.map(title => ({ title, count: 0 }));
    return [...list.map(p => p.title), ...famous.map(p => p.title)];
  }
  popular = { titles: list.map(p => p.title), counts: new Map(list.map(p => [p.title, p.count])), at: now() };
  return popular.titles;
}

// Carte « moyenne » : une page liée depuis une page populaire.
async function linkedTitle() {
  const src = pick(await popularTitles());
  const data = await api({ prop: 'links', titles: src, plnamespace: 0, pllimit: 'max' });
  const links = data.query?.pages?.[0]?.links || [];
  return links.length ? pick(links).title : src;
}

/* Tire n cartes. Chaque emplacement a une petite chance d'être une page
 * populaire (souvent ultra rare / légendaire) ou une page liée à une page
 * populaire (souvent rare / super rare). Le reste vient de la source du
 * booster : tout Wikipédia ou une catégorie thématique. */
async function drawCards(n, { luck = 1, cat = null, sure = 0, forceTop = 0 } = {}) {
  const special = [];
  let baseNeeded = 0;
  for (let i = 0; i < n; i++) {
    const r = Math.random();
    if (i < forceTop) special.push('forced');
    else if (r < 0.01 * luck) special.push('top');
    else if (i < sure || r < 0.15 * luck) special.push('linked');
    else baseNeeded++;
  }
  const base = n => cat
    ? categoryCards(cat, n).then(c => c.length ? c : randomCards(n))
    : randomCards(n);
  const titleJobs = special.map(kind => kind === 'linked'
    ? linkedTitle()
    : popularTitles().then(t => pick(t.slice(0, kind === 'forced' ? 80 : 400))));
  const [titles, based] = await Promise.all([
    Promise.allSettled(titleJobs),
    baseNeeded ? base(baseNeeded) : Promise.resolve([]),
  ]);
  const okTitles = [...new Set(titles.filter(t => t.status === 'fulfilled' && t.value).map(t => t.value))];
  let cards = [...(await detailsForTitles(okTitles).catch(() => [])), ...based];
  // dédoublonne et complète si besoin
  const seen = new Set();
  cards = cards.filter(c => !seen.has(c.id) && seen.add(c.id));
  for (let guard = 0; cards.length < n && guard < 3; guard++) {
    for (const c of await base(n - cards.length)) if (!seen.has(c.id)) { seen.add(c.id); cards.push(c); }
  }
  return shuffle(cards).slice(0, n);
}

// Tire n cartes Ultra rares au minimum, parmi les pages les plus vues.
async function drawEliteCards(n) {
  const pool = shuffle(await popularTitles());
  if (!pool.length) throw new Error('classement des pages les plus vues indisponible');
  const out = [], seen = new Set();
  for (let i = 0; out.length < n && i < pool.length && i < 300; i += 20) {
    for (const c of await detailsForTitles(pool.slice(i, i + 20))) {
      if (tierOf(c) >= 4 && !seen.has(c.id)) { seen.add(c.id); out.push(c); }
    }
  }
  if (out.length < n) throw new Error(`seulement ${out.length} carte(s) ultra rare(s) trouvée(s)`);
  return out.slice(0, n);
}

// ---------------------------------------------------------------- Rendu carte

function cardHTML(card, opts = {}) {
  const r = rarityOf(card);
  const owned = state.cards[card.id];
  const count = opts.count ?? (owned ? owned.n : 0);
  const img = card.img
    ? `<div class="card-img" style="background-image:url('${esc(card.img)}')"></div>`
    : `<div class="card-img">${esc(card.t.charAt(0))}</div>`;
  return `
    <div class="card r-${r.id}" data-id="${card.id}" ${opts.extraAttr || ''}>
      ${opts.isNew ? '<span class="badge new">NOUVEAU</span>' : ''}
      ${count > 1 && !opts.hideCount ? `<span class="badge">×${count}</span>` : ''}
      <div class="card-head"><span>${r.name}</span><span>${'★'.repeat(tierOf(card) + 1)}</span></div>
      ${img}
      <div class="card-title">${esc(card.t)}</div>
      <div class="card-desc">${esc(card.x)}</div>
      <div class="card-stats">
        <span class="views">👁 ${compact(card.v)} vues</span>
        <span class="value">Ƶ${r.sell}</span>
      </div>
    </div>`;
}

function compact(n) {
  return new Intl.NumberFormat('fr-FR', { notation: 'compact', maximumFractionDigits: 1 }).format(n);
}

// Effet holographique / inclinaison au survol
document.addEventListener('pointermove', e => {
  const card = e.target.closest?.('.card');
  if (!card || card.closest('.flip:not(.flipped)')) return;
  const b = card.getBoundingClientRect();
  const x = (e.clientX - b.left) / b.width, y = (e.clientY - b.top) / b.height;
  card.style.setProperty('--hx', `${x * 100}%`);
  card.style.setProperty('--hy', `${y * 100}%`);
  card.style.transform = `perspective(700px) rotateY(${(x - .5) * 14}deg) rotateX(${(.5 - y) * 14}deg) translateY(-4px)`;
});
document.addEventListener('pointerout', e => {
  const card = e.target.closest?.('.card');
  if (card && !card.contains(e.relatedTarget)) card.style.transform = '';
});

// ---------------------------------------------------------------- Navigation

let currentView = 'boosters';
function show(view) {
  currentView = view;
  document.querySelectorAll('.tab').forEach(t => t.classList.toggle('active', t.dataset.view === view));
  document.querySelectorAll('.view').forEach(v => v.classList.toggle('active', v.id === 'view-' + view));
  if (view === 'album') renderAlbum();
  if (view === 'market') renderMarket();
  if (view === 'profile') renderProfile();
}
document.querySelectorAll('.tab').forEach(t => t.addEventListener('click', () => show(t.dataset.view)));

function renderWallet() { $('#wallet').textContent = fmt(state.money); }

// ---------------------------------------------------------------- Boosters

let selectedPack = packById(state.pack);
let opening = false;
let prefetched = null;   // { id, promise } : le prochain booster, chargé à l'avance

const packStyle = p => `--c1:${p.colors[0]};--c2:${p.colors[1]};--c3:${p.colors[2]}`;
const isFree = p => p.id === 'classique';

// Sachet de booster : languette sertie à déchirer + corps en aluminium.
function packInner(p, big) {
  if (!big) return `<span class="pack-top"></span><span class="pack-body"><span class="pack-logo">${esc(p.ico)}</span></span>`;
  return `
    <div class="pack-top"><span class="pack-notch">✂ déchirer ici</span></div>
    <div class="pack-body">
      <div class="pack-shine"></div>
      <span class="pack-count">${BOOSTER_SIZE} cartes</span>
      <div class="pack-emblem"><span class="pack-logo">${esc(p.ico)}</span></div>
      <div class="pack-band"><div class="pack-kicker">Booster</div><div class="pack-title">${esc(p.name)}</div></div>
      <div class="pack-sub">WikiZizi · fr.wikipedia.org</div>
    </div>`;
}

function tickStock() {
  const t = now();
  if (state.stock >= STOCK_MAX) {
    state.lastRegen = t;
  } else {
    const gained = Math.floor((t - state.lastRegen) / REGEN_MS);
    if (gained > 0) {
      state.stock = Math.min(STOCK_MAX, state.stock + gained);
      state.lastRegen = state.stock >= STOCK_MAX ? t : state.lastRegen + gained * REGEN_MS;
      save();
    }
  }
  renderStock();
}

function renderStock() {
  const p = selectedPack;
  $('#stock').textContent = state.stock;
  $('#stock-max').textContent = STOCK_MAX;
  $('#stock-bar-fill').style.width = (state.stock / STOCK_MAX * 100) + '%';
  if (state.stock >= STOCK_MAX) {
    $('#stock-timer').textContent = 'Stock plein — ouvre-les !';
  } else {
    const left = REGEN_MS - (now() - state.lastRegen);
    const m = Math.floor(left / 60000), s = Math.floor(left % 60000 / 1000);
    $('#stock-timer').textContent = `Prochain booster gratuit dans ${m}:${String(s).padStart(2, '0')}`;
  }
  const free = isFree(p);
  const all = Math.min(state.stock, MULTI_MAX);
  $('#open-btn').classList.toggle('hidden', !free);
  $('#open-btn').disabled = opening || state.stock < 1;
  $('#open-all-btn').classList.toggle('hidden', !free || all < 2);
  $('#open-all-btn').disabled = opening;
  $('#open-all-btn').textContent = `Tout ouvrir (${all})`;
  $('#buy-booster-btn').textContent = p.elite
    ? `Ouvrir le booster légendaire (×${state.legendPacks || 0})`
    : `Acheter et ouvrir · Ƶ${p.price}`;
  $('#buy-booster-btn').classList.toggle('primary', !free);
  $('#buy-booster-btn').disabled = opening || (p.elite ? !(state.legendPacks > 0) : state.money < p.price);
  const canOpen = p.elite ? state.legendPacks > 0 : free ? state.stock > 0 || state.money >= p.price : state.money >= p.price;
  $('#pack').classList.toggle('disabled', opening || !canOpen);
}

function renderSelectedPack() {
  const p = selectedPack;
  const el = $('#pack');
  el.setAttribute('style', packStyle(p));
  el.className = `pack pack-${p.id}`;
  el.innerHTML = packInner(p, true);
  $('#pack-name').textContent = `Booster ${p.name}`;
  $('#pack-desc').textContent = p.desc;
  const top = Math.min(1, 0.01 * p.luck), linked = Math.min(1, 0.15 * p.luck) - top;
  if (p.elite) { $('#pack-odds').innerHTML = '<b>100 %</b> de cartes Ultra rares ou Légendaires.'; return; }
  $('#pack-odds').innerHTML = `Par carte : <b>${pct(top)}</b> de chance d'une page très célèbre, <b>${pct(linked)}</b> d'une page connue`
    + (p.sure ? `, et <b>${p.sure}</b> page connue garantie` : '') + '.';
}
const pct = x => (x * 100).toLocaleString('fr-FR', { maximumFractionDigits: 1 }) + ' %';

function renderPackShop() {
  $('#pack-shop').innerHTML = PACKS.filter(p => !p.elite || state.legendPacks > 0).map(p => `
    <button class="shop-item ${p.id === selectedPack.id ? 'active' : ''}" data-pack="${p.id}">
      <span class="pack mini pack-${p.id}" style="${packStyle(p)}">${packInner(p)}</span>
      <span class="shop-text">
        <b>${esc(p.name)}</b>
        <small>${esc(p.desc)}</small>
        <span class="price">${p.elite ? `×${state.legendPacks} en réserve · gratuit` : `Ƶ${p.price}${isFree(p) ? ' · ou gratuit avec le stock' : ''}`}</span>
      </span>
    </button>`).join('');
}

function selectPack(id) {
  if (opening) return;
  selectedPack = packById(id);
  state.pack = selectedPack.id;
  save();
  renderSelectedPack();
  renderPackShop();
  renderStock();
  prefetchBooster();
}

function prefetchBooster() {
  const p = selectedPack;
  if (p.elite) return;
  if (prefetched && prefetched.id === p.id) return;
  const entry = { id: p.id };
  entry.promise = drawCards(BOOSTER_SIZE, p).catch(() => {
    if (prefetched === entry) prefetched = null;
    return null;
  });
  prefetched = entry;
}

function takePrefetched() {
  prefetchBooster();
  const { promise } = prefetched;
  prefetched = null;
  return promise;
}

// Ouvre `count` boosters du type sélectionné (payés ou pris dans le stock gratuit).
async function openBooster(paid, count = 1) {
  if (opening) return;
  const p = selectedPack;
  if (p.elite && !(state.legendPacks > 0)) return toast('Plus de booster légendaire… il faut le code secret !', 'bad');
  if (!isFree(p)) paid = true;
  if (!paid && state.stock < count) {
    return toast(state.money >= p.price
      ? `Plus de booster gratuit. Tu peux en acheter un pour Ƶ${p.price}.`
      : 'Plus de booster en stock. Patiente un peu !', 'bad');
  }
  if (!p.elite && paid && state.money < p.price * count) return toast('Pas assez de wikizgeg.', 'bad');

  opening = true;
  renderStock();
  const el = $('#pack');
  el.classList.add('opening');
  $('#reveal').classList.add('hidden');
  try {
    const forced = !p.elite && state.cheatTop > 0;
    const jobs = [p.elite ? drawEliteCards(BOOSTER_SIZE) : forced ? drawCards(BOOSTER_SIZE, { ...p, forceTop: 1 }) : takePrefetched()];
    for (let i = 1; i < count; i++) jobs.push(drawCards(BOOSTER_SIZE, p));
    const [packs] = await Promise.all([Promise.all(jobs), sleep(1350)]);
    const ok = packs.filter(cards => cards && cards.length);
    if (!ok.length) throw new Error('vide');
    const n = ok.length;
    if (forced) state.cheatTop--;
    if (p.elite) state.legendPacks--;
    else if (paid) addMoney(-p.price * n); else state.stock -= n;
    state.stats.opened += n;
    state.stats.packs[p.id] = (state.stats.packs[p.id] || 0) + n;
    if (ok.some(cards => cards.filter(c => tierOf(c) === 5).length >= 2)) state.stats.godpack++;
    save();
    showReveal(ok.flat(), p, n);
    prefetchBooster();
  } catch (e) {
    console.error(e);
    toast(`Le booster n'a pas pu être ouvert (${esc(e.message)}). Il n'est pas perdu, réessaie !`, 'bad');
    opening = false;
  } finally {
    el.classList.remove('opening');
    renderStock();
  }
}

function showReveal(cards, pack, nPacks) {
  // la meilleure carte en dernier, pour le suspense
  cards.sort((a, b) => a.v - b.v);
  const row = $('#reveal-row');
  row.classList.toggle('many', cards.length > BOOSTER_SIZE);
  row.innerHTML = cards.map((c, i) => `
    <div class="flip r-${rarityOf(c).id} ${tierOf(c) >= 2 ? 'glow' : ''}" data-i="${i}">
      <div class="flip-inner">
        <div class="flip-front"><div class="card-back" style="${packStyle(pack)};animation-delay:${Math.min(i, 20) * 70}ms">${esc(pack.ico)}</div></div>
        <div class="flip-back">${cardHTML(c, { isNew: !state.cards[c.id], hideCount: true })}</div>
      </div>
    </div>`).join('');
  $('#reveal').classList.remove('hidden');
  $('#reveal-done').classList.add('hidden');
  $('#reveal-all').classList.remove('hidden');
  $('#reveal-title').textContent = nPacks > 1 ? `${nPacks} boosters ${pack.name}` : `Booster ${pack.name}`;
  $('#reveal-hint').textContent = 'Clique sur les cartes pour les retourner — la meilleure est à la fin !';

  let flipped = 0;
  const flip = el => {
    if (el.classList.contains('flipped')) return;
    el.classList.add('flipped');
    const c = cards[el.dataset.i];
    const t = tierOf(c);
    if (t >= 4) celebrate(t);
    if (t >= (nPacks > 1 ? 4 : 3)) toast(`✨ <b>${esc(rarityOf(c).name)}</b> : ${esc(c.t)} !`, 'gold');
    $('#reveal-count').textContent = `${++flipped} / ${cards.length}`;
    if (flipped === cards.length) finishReveal(cards, pack, nPacks);
  };
  $('#reveal-count').textContent = `0 / ${cards.length}`;
  row.querySelectorAll('.flip').forEach(el => el.addEventListener('click', () => {
    if (el.classList.contains('flipped')) openDetail(cards[el.dataset.i]);
    else flip(el);
  }));
  $('#reveal-all').onclick = async () => {
    $('#reveal-all').classList.add('hidden');
    for (const el of row.querySelectorAll('.flip:not(.flipped)')) {
      flip(el);
      await sleep(cards.length > BOOSTER_SIZE ? 60 : 220);
    }
  };
  $('#reveal-done').onclick = () => {
    $('#reveal').classList.add('hidden');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };
  $('#reveal').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function finishReveal(cards, pack, nPacks) {
  let newOnes = 0;
  for (const c of cards) {
    const prev = state.cards[c.id];
    if (prev) { prev.n++; Object.assign(prev, c, { n: prev.n, at: prev.at }); }
    else { state.cards[c.id] = { ...c, n: 1, at: now() }; newOnes++; }
    state.stats.pulls[tierOf(c)] = (state.stats.pulls[tierOf(c)] || 0) + 1;
  }
  state.history.unshift({ at: now(), pack: pack.id, n: nPacks, cards: cards.map(c => ({ id: c.id, t: c.t, v: c.v })) });
  state.history.length = Math.min(state.history.length, HISTORY_MAX);
  save();
  checkAchievements();
  opening = false;
  renderStock();
  renderHistory();
  renderPackShop();
  $('#reveal-all').classList.add('hidden');
  $('#reveal-hint').textContent = newOnes
    ? `${newOnes} nouvelle${newOnes > 1 ? 's' : ''} carte${newOnes > 1 ? 's' : ''} pour ton album !`
    : 'Que des doublons… tu peux les revendre dans l\'album.';
  $('#reveal-done').classList.remove('hidden');
  if (pack.elite && !(state.legendPacks > 0)) selectPack('classique');
}

// Flash + confettis pour les cartes ultra rares et légendaires.
function celebrate(tier) {
  const fx = document.createElement('div');
  fx.className = `fx fx-${RARITIES[tier].id}`;
  const colors = tier === 5 ? ['#ffd23f', '#fff3b0', '#ffb300', '#ffffff'] : ['#ff7a3d', '#ffb38a', '#ffd23f', '#ff5d73'];
  const n = tier === 5 ? 90 : 40;
  for (let i = 0; i < n; i++) {
    const c = document.createElement('i');
    c.style.left = Math.random() * 100 + '%';
    c.style.background = pick(colors);
    c.style.animationDelay = Math.random() * 0.6 + 's';
    c.style.animationDuration = 1.6 + Math.random() * 1.4 + 's';
    c.style.setProperty('--drift', (Math.random() * 200 - 100) + 'px');
    fx.appendChild(c);
  }
  document.body.appendChild(fx);
  setTimeout(() => fx.remove(), 3500);
}

function renderHistory() {
  const h = state.history;
  $('#history').innerHTML = h.length ? h.map(entry => {
    const p = packById(entry.pack);
    const best = entry.cards.reduce((a, c) => (c.v > a.v ? c : a));
    const r = rarityOf(best);
    const when = new Date(entry.at).toLocaleString('fr-FR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
    return `
      <div class="hist">
        <span class="pack mini tiny pack-${p.id}" style="${packStyle(p)}">${packInner(p)}</span>
        <div class="hist-main">
          <div><b>${esc(p.name)}</b>${entry.n > 1 ? ` ×${entry.n}` : ''} <span class="muted small">· ${when}</span></div>
          <div class="hist-dots">${entry.cards.map(c => `<span class="dot r-${rarityOf(c).id}" title="${esc(c.t)}"></span>`).join('')}</div>
        </div>
        <div class="hist-best r-${r.id}" data-id="${best.id}"><small>Meilleure carte</small><b>${esc(best.t)}</b><span>${r.name}</span></div>
      </div>`;
  }).join('') : '<p class="muted">Aucun booster ouvert pour l\'instant.</p>';
}

$('#history').addEventListener('click', e => {
  const b = e.target.closest('.hist-best');
  if (b && state.cards[b.dataset.id]) openDetail(state.cards[b.dataset.id]);
});

$('#rarity-list').innerHTML = RARITIES.map((r, i) => {
  const next = RARITIES[i + 1];
  const range = next ? `${fmt(r.min)} – ${fmt(next.min - 1)} vues` : `${fmt(r.min)}+ vues`;
  return `<li class="r-${r.id}"><span><span class="dot"></span>${r.name}</span><span class="muted">${range} · vente Ƶ${r.sell}</span></li>`;
}).join('');

function clickPack() {
  const p = selectedPack;
  if (isFree(p) && state.stock < 1 && state.money >= p.price) return openBooster(true);
  openBooster(!isFree(p));
}
$('#pack').addEventListener('click', clickPack);
$('#pack').addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); clickPack(); } });
$('#open-btn').addEventListener('click', () => openBooster(false));
$('#open-all-btn').addEventListener('click', () => openBooster(false, Math.min(state.stock, MULTI_MAX)));
$('#buy-booster-btn').addEventListener('click', () => openBooster(true));
$('#pack-shop').addEventListener('click', e => {
  const b = e.target.closest('[data-pack]');
  if (b) selectPack(b.dataset.pack);
});

// ---------------------------------------------------------------- Album

$('#album-rarity').innerHTML += RARITIES.map((r, i) => `<option value="${i}">${r.name}</option>`).join('');
['#album-search', '#album-rarity', '#album-sort'].forEach(s => $(s).addEventListener('input', renderAlbum));

function renderAlbum() {
  const all = Object.values(state.cards);
  const q = $('#album-search').value.trim().toLowerCase();
  const rf = $('#album-rarity').value;
  const sort = $('#album-sort').value;
  let list = all.filter(c => (!q || c.t.toLowerCase().includes(q)) && (rf === '' || tierOf(c) === +rf));
  const sorters = {
    rarity: (a, b) => b.v - a.v,
    views: (a, b) => b.v - a.v,
    recent: (a, b) => b.at - a.at,
    alpha: (a, b) => a.t.localeCompare(b.t, 'fr'),
    dupes: (a, b) => b.n - a.n || b.v - a.v,
  };
  if (sort === 'rarity') list.sort((a, b) => tierOf(b) - tierOf(a) || b.v - a.v);
  else list.sort(sorters[sort]);

  const total = all.reduce((a, c) => a + c.n, 0);
  $('#album-count').textContent = `· ${fmt(all.length)} uniques · ${fmt(total)} au total`;
  const counts = RARITIES.map((_, i) => all.filter(c => tierOf(c) === i).length);
  $('#rarity-progress').innerHTML = RARITIES.map((r, i) =>
    `<span class="pill r-${r.id}"><span class="dot"></span>${r.name} <b>${counts[i]}</b></span>`).join('');
  $('#album-grid').innerHTML = list.slice(0, 600).map(c => cardHTML(c)).join('');
  $('#album-empty').classList.toggle('hidden', all.length > 0);
  const dupes = all.reduce((a, c) => a + (c.n - 1), 0);
  $('#sell-dupes').disabled = dupes === 0;
  $('#sell-dupes').textContent = dupes ? `Vendre les ${dupes} doublons` : 'Aucun doublon';
}

$('#album-grid').addEventListener('click', e => {
  const el = e.target.closest('.card');
  if (el) openDetail(state.cards[el.dataset.id]);
});

$('#sell-dupes').addEventListener('click', () => {
  let gain = 0, n = 0;
  for (const c of Object.values(state.cards)) {
    if (c.n > 1) { gain += (c.n - 1) * rarityOf(c).sell; n += c.n - 1; c.n = 1; }
  }
  if (!n) return;
  if (!confirm(`Vendre ${n} doublon${n > 1 ? 's' : ''} pour Ƶ${gain} ?`)) return;
  state.stats.sold += n;
  addMoney(gain);
  save();
  checkAchievements();
  toast(`+Ƶ${gain} pour ${n} doublon${n > 1 ? 's' : ''}`, 'good');
  renderAlbum();
});

// ---------------------------------------------------------------- Détail

function openDetail(card, opts = {}) {
  if (!card) return;
  const owned = state.cards[card.id];
  const r = rarityOf(card);
  const url = 'https://fr.wikipedia.org/wiki/' + encodeURIComponent(card.t.replace(/ /g, '_'));
  $('#modal-box').innerHTML = `
    <div class="detail">
      ${cardHTML(card, { hideCount: true })}
      <div class="detail-body">
        <h2 style="margin-top:0">${esc(card.t)}</h2>
        <p>${esc(card.x)}</p>
        <dl class="kv">
          <dt>Rareté</dt><dd class="r-${r.id}"><span class="dot"></span>${r.name}</dd>
          <dt>Vues (30 jours)</dt><dd>${fmt(card.v)}</dd>
          <dt>Valeur de revente</dt><dd>Ƶ${r.sell}</dd>
          ${owned ? `<dt>Exemplaires</dt><dd>${owned.n}</dd><dt>Obtenue le</dt><dd>${new Date(owned.at).toLocaleDateString('fr-FR')}</dd>` : ''}
        </dl>
        <div class="row">
          <a class="btn" href="${url}" target="_blank" rel="noopener">Lire sur Wikipédia ↗</a>
          ${owned && !opts.readOnly ? `<button class="btn" id="sell-one">Vendre 1 · Ƶ${r.sell}</button>` : ''}
          <button class="btn" id="close-modal">Fermer</button>
        </div>
      </div>
    </div>`;
  $('#modal').classList.remove('hidden');
  $('#close-modal').onclick = closeModal;
  const sell = $('#sell-one');
  if (sell) sell.onclick = () => {
    const c = state.cards[card.id];
    if (!c) return;
    const last = c.n <= 1;
    if (last && !confirm(`C'est ton dernier exemplaire de « ${card.t} ». Le vendre quand même ?`)) return;
    if (last) delete state.cards[card.id]; else c.n--;
    state.stats.sold++;
    addMoney(r.sell);
    save();
    toast(`+Ƶ${r.sell}`, 'good');
    closeModal();
    if (currentView === 'album') renderAlbum();
  };
}
function closeModal() { $('#modal').classList.add('hidden'); }
$('#modal').addEventListener('click', e => { if (e.target.id === 'modal') closeModal(); });
document.addEventListener('keydown', e => { if (e.key === 'Escape') closeModal(); });

// ---------------------------------------------------------------- Marché

function marketExpired() { return now() - state.market.at > MARKET_TTL || !state.market.offers.length; }
let marketLoading = false;

async function refreshMarket(paid) {
  if (marketLoading) return;
  if (paid && state.money < MARKET_REFRESH_PRICE) return toast('Pas assez de wikizgeg.', 'bad');
  marketLoading = true;
  $('#market-grid').innerHTML = '<p class="empty"><span class="loader"></span> Les marchands installent leurs étals…</p>';
  try {
    const cards = await drawCards(6, { luck: 2.5 });
    if (!cards.length) throw new Error('vide');
    if (paid) addMoney(-MARKET_REFRESH_PRICE);
    state.market = {
      at: now(),
      offers: cards.map(c => ({ card: c, price: rarityOf(c).sell * 4 + 5 + (hash(c.t) % 7), sold: false })),
    };
    save();
  } catch (e) {
    console.error(e);
    toast('Impossible de charger le marché (Wikipédia injoignable).', 'bad');
  }
  marketLoading = false;
  renderMarket(true);
}

function renderMarket(skipRefresh) {
  if (!skipRefresh && marketExpired()) return refreshMarket(false);
  const offers = state.market.offers;
  $('#market-grid').innerHTML = offers.length ? offers.map((o, i) => `
    <div class="offer ${o.sold ? 'sold' : ''}">
      ${cardHTML(o.card, { hideCount: true })}
      <button class="btn ${o.sold ? '' : 'primary'} small" data-buy="${i}" ${o.sold || state.money < o.price ? 'disabled' : ''}>
        ${o.sold ? 'Vendu' : `Acheter · Ƶ${o.price}`}${state.cards[o.card.id] && !o.sold ? ' (déjà possédée)' : ''}
      </button>
    </div>`).join('') : '<p class="empty">Aucune offre pour le moment.</p>';
  updateMarketTimer();
}

function updateMarketTimer() {
  const left = Math.max(0, MARKET_TTL - (now() - state.market.at));
  $('#market-timer').textContent = `${Math.floor(left / 60000)} min`;
  $('#market-refresh').disabled = marketLoading || state.money < MARKET_REFRESH_PRICE;
}

$('#market-grid').addEventListener('click', e => {
  const b = e.target.closest('[data-buy]');
  if (b) {
    const o = state.market.offers[b.dataset.buy];
    if (!o || o.sold || state.money < o.price) return;
    addMoney(-o.price);
    o.sold = true;
    const prev = state.cards[o.card.id];
    if (prev) prev.n++; else state.cards[o.card.id] = { ...o.card, n: 1, at: now() };
    state.stats.bought++;
    save();
    checkAchievements();
    toast(`« ${esc(o.card.t)} » ajoutée à ton album !`, 'good');
    renderMarket(true);
    return;
  }
  const c = e.target.closest('.card');
  if (c) openDetail(state.market.offers.find(o => String(o.card.id) === c.dataset.id)?.card, { readOnly: true });
});
$('#market-refresh').addEventListener('click', () => refreshMarket(true));

// ---------------------------------------------------------------- Profil

function checkAchievements() {
  for (const a of ACHIEVEMENTS) {
    if (!state.achievements[a.id] && a.test(state)) {
      state.achievements[a.id] = now();
      toast(`${a.ico} Succès débloqué : <b>${esc(a.name)}</b>`, 'gold');
    }
  }
  save();
}

function renderProfile() {
  const cards = Object.values(state.cards);
  const best = cards.reduce((a, c) => (!a || c.v > a.v ? c : a), null);
  const value = cards.reduce((a, c) => a + rarityOf(c).sell * c.n, 0);
  const stats = [
    ['Cartes uniques', fmt(cards.length)],
    ['Cartes au total', fmt(cards.reduce((a, c) => a + c.n, 0))],
    ['Valeur de l\'album', 'Ƶ' + fmt(value)],
    ['Boosters ouverts', fmt(state.stats.opened)],
    ...RARITIES.map((r, i) => [`${r.name}s tirées`, fmt(state.stats.pulls[i] || 0)]),
    ['Wikizgeg gagnés', 'Ƶ' + fmt(state.stats.earned)],
    ['Meilleure carte', best ? esc(best.t) : '—'],
  ];
  $('#stats').innerHTML = stats.map(([k, v]) => `<div class="stat"><b>${v}</b><span>${k}</span></div>`).join('');
  renderCheatList();
  $('#achievements').innerHTML = ACHIEVEMENTS.map(a => `
    <div class="ach ${state.achievements[a.id] ? 'done' : ''}">
      <span class="ico">${a.ico}</span><div><b>${esc(a.name)}</b><small>${esc(a.desc)}</small></div>
    </div>`).join('');
}

$('#export-save').addEventListener('click', () => {
  const blob = new Blob([JSON.stringify(state)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `wikizizi-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  URL.revokeObjectURL(a.href);
});
$('#import-save').addEventListener('click', () => {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = 'application/json';
  input.onchange = async () => {
    try {
      const s = JSON.parse(await input.files[0].text());
      if (!s || typeof s.cards !== 'object') throw new Error('format');
      const base = freshState();
      state = { ...base, ...s, stats: { ...base.stats, ...s.stats } };
      save();
      toast('Sauvegarde importée !', 'good');
      renderAll();
    } catch (e) { toast('Fichier de sauvegarde invalide.', 'bad'); }
  };
  input.click();
});
$('#reset-save').addEventListener('click', () => {
  if (!confirm('Effacer toute ta collection et recommencer à zéro ?')) return;
  state = freshState();
  save();
  renderAll();
  toast('Nouvelle partie commencée.');
});

// ---------------------------------------------------------------- Codes secrets

/* Tape une combinaison de touches n'importe où dans le jeu.
 * Sur téléphone : tape 5 fois sur le logo pour saisir un code. */
const CHEATS = [
  { id: 'konami', keys: ['arrowup', 'arrowup', 'arrowdown', 'arrowdown', 'arrowleft', 'arrowright', 'arrowleft', 'arrowright', 'b', 'a'],
    hint: '↑ ↑ ↓ ↓ ← → ← → B A', name: 'Le code Konami', desc: '+1 000 Ƶ, stock plein et arc-en-ciel',
    run() {
      addMoney(1000);
      state.stock = STOCK_MAX;
      celebrate(5);
      document.body.classList.add('rainbow');
      setTimeout(() => document.body.classList.remove('rainbow'), 6000);
    } },
  { id: 'zizi', keys: 'zizi', name: 'Pluie de wikizgeg', desc: 'Il pleut des pièces (+100 Ƶ)',
    run() { coinRain(); addMoney(100); } },
  { id: 'legende', keys: 'legende', name: 'Destin légendaire', desc: 'Ton prochain booster contient une page ultra célèbre',
    run() { state.cheatTop = (state.cheatTop || 0) + 1; celebrate(4); } },
  { id: 'boost', keys: 'boost', name: 'Turbo', desc: 'Stock de boosters gratuits rempli',
    run() { state.stock = STOCK_MAX; state.lastRegen = now(); celebrate(4); } },
  { id: 'disco', keys: 'disco', name: 'Disco', desc: 'Les cartes dansent (retape pour arrêter)',
    run() { document.body.classList.toggle('disco'); } },
  { id: 'gravite', keys: 'gravite', name: 'Gravité', desc: 'Tout tombe… puis revient',
    run() { gravity(); } },
  { id: 'miroir', keys: 'miroir', name: 'Miroir', desc: 'Le monde à l\'envers pendant 5 secondes',
    run() {
      document.body.classList.add('mirror');
      setTimeout(() => document.body.classList.remove('mirror'), 5000);
    } },
  { id: 'legendpack', keys: 'aetuoqdgjlwcb', hint: 'aetuoqdgjlwcb', name: 'Booster légendaire', desc: 'Un booster secret rempli d\'Ultra rares et de Légendaires',
    run() {
      state.legendPacks = (state.legendPacks || 0) + 1;
      celebrate(5);
      document.body.classList.add('rainbow');
      setTimeout(() => document.body.classList.remove('rainbow'), 3000);
      show('boosters');
      selectPack('legendaire');
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } },
];
CHEATS.forEach(c => { if (typeof c.keys === 'string') c.keys = [...c.keys]; });

function activateCheat(c) {
  state.cheats = state.cheats || {};
  const first = !state.cheats[c.id];
  state.cheats[c.id] = (state.cheats[c.id] || 0) + 1;
  c.run();
  save();
  renderStock();
  renderWallet();
  cheatBanner(c.name, c.desc);
  if (first) toast(`🕹️ Code secret découvert : <b>${esc(c.name)}</b>`, 'gold');
  if (currentView === 'profile') renderProfile();
}

let keyBuffer = [];
document.addEventListener('keydown', e => {
  if (e.target.closest?.('input, select, textarea') || e.ctrlKey || e.metaKey || e.altKey) return;
  const k = e.key.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  if (k.length !== 1 && !k.startsWith('arrow')) return;
  keyBuffer.push(k);
  keyBuffer = keyBuffer.slice(-40);
  for (const c of CHEATS) {
    const tail = keyBuffer.slice(-c.keys.length);
    if (tail.length === c.keys.length && tail.every((x, i) => x === c.keys[i])) {
      keyBuffer = [];
      activateCheat(c);
      break;
    }
  }
});

// Sur mobile : 5 tapes rapides sur le logo
let logoTaps = [];
$('.brand').addEventListener('click', () => {
  const t = now();
  logoTaps = [...logoTaps.filter(x => t - x < 2500), t];
  if (logoTaps.length < 5) return;
  logoTaps = [];
  const typed = (prompt('🕹️ Code secret ?') || '').trim().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, '');
  if (!typed) return;
  const c = CHEATS.find(c => c.keys.join('') === typed || c.id === typed);
  if (c) activateCheat(c); else toast('Code inconnu… 🤔', 'bad');
});

function cheatBanner(title, sub) {
  document.querySelectorAll('.cheat-banner').forEach(b => b.remove());
  const el = document.createElement('div');
  el.className = 'cheat-banner';
  el.innerHTML = `<small>Code activé</small><b>${esc(title)}</b><span>${esc(sub)}</span>`;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 2800);
}

function coinRain() {
  const fx = document.createElement('div');
  fx.className = 'fx';
  for (let i = 0; i < 70; i++) {
    const c = document.createElement('i');
    c.className = 'coin-drop';
    c.textContent = 'Z';
    c.style.left = Math.random() * 100 + '%';
    c.style.animationDelay = Math.random() * 1.2 + 's';
    c.style.animationDuration = 1.5 + Math.random() * 1.5 + 's';
    c.style.setProperty('--drift', (Math.random() * 120 - 60) + 'px');
    fx.appendChild(c);
  }
  document.body.appendChild(fx);
  setTimeout(() => fx.remove(), 4500);
}

function gravity() {
  const els = [...document.querySelectorAll('.view.active .card, .view.active .pack, .view.active .shop-item, .view.active .hist, .view.active .stock, .view.active h1, .view.active h2')];
  els.forEach(el => {
    el.style.setProperty('--r', (Math.random() * 120 - 60) + 'deg');
    el.style.animationDelay = Math.random() * 0.4 + 's';
    el.classList.add('falling');
  });
  setTimeout(() => els.forEach(el => {
    el.classList.remove('falling');
    el.style.animationDelay = '';
    el.classList.add('rising');
    setTimeout(() => el.classList.remove('rising'), 700);
  }), 2600);
}

function renderCheatList() {
  const found = state.cheats || {};
  $('#cheats').innerHTML = CHEATS.map(c => found[c.id] ? `
    <div class="ach done"><span class="ico">🕹️</span><div><b>${esc(c.name)}</b><small>${esc(c.hint || c.keys.join('').toUpperCase())} — ${esc(c.desc)}</small></div></div>` : `
    <div class="ach"><span class="ico">❓</span><div><b>???</b><small>Code encore secret</small></div></div>`).join('');
}

// ---------------------------------------------------------------- Boucle

function renderAll() {
  selectedPack = packById(state.pack);
  renderSelectedPack();
  renderPackShop();
  renderHistory();
  renderWallet();
  renderStock();
  show(currentView);
}

renderAll();
setInterval(() => {
  tickStock();
  if (currentView === 'market') updateMarketTimer();
}, 1000);
tickStock();
prefetchBooster();
