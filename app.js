/* WikiMaster — un jeu de cartes à collectionner tiré de Wikipédia.
 * Tout tourne dans le navigateur : les cartes viennent de l'API publique
 * de fr.wikipedia.org et la partie est sauvegardée dans localStorage. */
'use strict';

// ---------------------------------------------------------------- Config

const API = 'https://fr.wikipedia.org/w/api.php';
const SAVE_KEY = 'wikimaster.save.v1';

const REGEN_MS = 10 * 60 * 1000;  // un booster toutes les 10 minutes
const STOCK_MAX = 10;
const BOOSTER_SIZE = 5;
const BOOSTER_PRICE = 25;
const MARKET_TTL = 30 * 60 * 1000;
const MARKET_REFRESH_PRICE = 10;
const POPULAR_TTL = 6 * 60 * 60 * 1000;

// Rareté selon le nombre de vues de la page sur 30 jours.
const RARITIES = [
  { id: 'commune',      name: 'Commune',      min: 0,     sell: 1 },
  { id: 'peu-commune',  name: 'Peu commune',  min: 50,    sell: 3 },
  { id: 'rare',         name: 'Rare',         min: 200,   sell: 8 },
  { id: 'super-rare',   name: 'Super rare',   min: 1000,  sell: 25 },
  { id: 'ultra-rare',   name: 'Ultra rare',   min: 5000,  sell: 80 },
  { id: 'legendaire',   name: 'Légendaire',   min: 20000, sell: 300 },
];

const ACHIEVEMENTS = [
  { id: 'first',    ico: '🎁', name: 'Premier booster',      desc: 'Ouvrir ton premier booster',       test: s => s.stats.opened >= 1 },
  { id: 'c10',      ico: '📗', name: 'Lecteur curieux',      desc: '10 cartes différentes',            test: s => uniqueCount(s) >= 10 },
  { id: 'c50',      ico: '📘', name: 'Encyclopédiste',       desc: '50 cartes différentes',            test: s => uniqueCount(s) >= 50 },
  { id: 'c150',     ico: '📕', name: 'Bibliothécaire',       desc: '150 cartes différentes',           test: s => uniqueCount(s) >= 150 },
  { id: 'c500',     ico: '🏛️', name: 'Grand Wikimaster',     desc: '500 cartes différentes',           test: s => uniqueCount(s) >= 500 },
  { id: 'rare',     ico: '🔷', name: 'Ça devient sérieux',   desc: 'Obtenir une carte Rare',           test: s => hasTier(s, 2) },
  { id: 'super',    ico: '💜', name: 'Super !',              desc: 'Obtenir une carte Super rare',     test: s => hasTier(s, 3) },
  { id: 'ultra',    ico: '🔥', name: 'Ultra instinct',       desc: 'Obtenir une carte Ultra rare',     test: s => hasTier(s, 4) },
  { id: 'legend',   ico: '👑', name: 'Légende vivante',      desc: 'Obtenir une carte Légendaire',     test: s => hasTier(s, 5) },
  { id: 'duel1',    ico: '⚔️', name: 'Premier sang',         desc: 'Gagner un duel',                   test: s => s.stats.wins >= 1 },
  { id: 'duel10',   ico: '🏆', name: 'Champion du savoir',   desc: 'Gagner 10 duels',                  test: s => s.stats.wins >= 10 },
  { id: 'perfect',  ico: '🧠', name: 'Sans faute',           desc: 'Gagner un duel sans erreur',       test: s => s.stats.perfect >= 1 },
  { id: 'rich',     ico: '💰', name: 'Wikibidou-naire',      desc: 'Posséder 1 000 wikibidous',        test: s => s.money >= 1000 },
  { id: 'trader',   ico: '🏪', name: 'Marchand',             desc: 'Acheter 5 cartes au marché',       test: s => s.stats.bought >= 5 },
];

// Titres de secours pour les questions quand l'album est encore petit.
const FALLBACK_TITLES = [
  'Tour Eiffel', 'Napoléon Ier', 'Photosynthèse', 'Jazz', 'Volcan', 'Rome antique', 'Marie Curie',
  'Baleine bleue', 'Échecs', 'Mont Blanc', 'Révolution française', 'Croissant (viennoiserie)',
  'Système solaire', 'Victor Hugo', 'Football', 'Amazonie', 'Pyramides de Gizeh', 'Internet',
];

// ---------------------------------------------------------------- State

const now = () => Date.now();

function freshState() {
  return {
    money: 50,
    stock: 3,
    lastRegen: now(),
    cards: {},          // pageid -> carte
    market: { offers: [], at: 0 },
    stats: { opened: 0, wins: 0, losses: 0, draws: 0, perfect: 0, sold: 0, bought: 0, earned: 0 },
    achievements: {},
  };
}

let state = load();
let popular = { titles: [], at: 0 };   // non sauvegardé

function load() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (raw) {
      const s = JSON.parse(raw);
      const base = freshState();
      return { ...base, ...s, stats: { ...base.stats, ...s.stats }, market: s.market || base.market };
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

function statsOf(card) {
  const t = tierOf(card);
  const h = hash(card.t);
  const atk = 10 + t * 6 + Math.floor(Math.log10(card.v + 1) * 4) + (h % 6);
  const def = 6 + t * 4 + Math.min(15, Math.floor((card.len || 0) / 6000)) + ((h >> 4) % 5);
  return { atk, def };
}

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
  piprop: 'thumbnail', pithumbsize: 400, pilimit: 'max',
  pvipdays: 30,
  ppprop: 'disambiguation',
  redirects: 1,
};

function toCard(p) {
  if (!p || p.missing || p.invalid || p.ns !== 0) return null;
  if (p.pageprops && 'disambiguation' in p.pageprops) return null;
  const extract = (p.extract || '').replace(/\s+/g, ' ').trim();
  if (extract.length < 40) return null;
  const v = Object.values(p.pageviews || {}).reduce((a, b) => a + (b || 0), 0);
  return {
    id: p.pageid,
    t: p.title,
    x: extract.length > 900 ? extract.slice(0, 900).replace(/\s\S*$/, '') + '…' : extract,
    img: p.thumbnail ? p.thumbnail.source : '',
    v,
    len: p.length || 0,
  };
}

async function detailsForTitles(titles) {
  if (!titles.length) return [];
  const data = await api({ ...DETAIL_PARAMS, titles: titles.slice(0, 50).join('|') });
  return (data.query?.pages || []).map(toCard).filter(Boolean);
}

async function randomCards(n) {
  const data = await api({ ...DETAIL_PARAMS, generator: 'random', grnnamespace: 0, grnlimit: Math.min(20, n + 4) });
  return (data.query?.pages || []).map(toCard).filter(Boolean);
}

async function popularTitles() {
  if (popular.titles.length && now() - popular.at < POPULAR_TTL) return popular.titles;
  const data = await api({ list: 'mostviewed', pvimlimit: 500 });
  const titles = (data.query?.mostviewed || [])
    .filter(p => p.ns === 0 && !/^(Wikipédia|Accueil|Spécial)/.test(p.title) && p.title !== 'Wikipédia:Accueil principal')
    .map(p => p.title);
  popular = { titles, at: now() };
  return titles;
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
 * populaire (souvent rare / super rare). Le reste est purement aléatoire. */
async function drawCards(n, luck = 1) {
  const special = [];
  let randomNeeded = 0;
  for (let i = 0; i < n; i++) {
    const r = Math.random();
    if (r < 0.05 * luck) special.push('top');
    else if (r < 0.25 * luck) special.push('linked');
    else randomNeeded++;
  }
  const titleJobs = special.map(kind => kind === 'top'
    ? popularTitles().then(t => pick(t.slice(0, 400)))
    : linkedTitle());
  const [titles, randoms] = await Promise.all([
    Promise.allSettled(titleJobs),
    randomNeeded ? randomCards(randomNeeded) : Promise.resolve([]),
  ]);
  const okTitles = titles.filter(t => t.status === 'fulfilled' && t.value).map(t => t.value);
  let cards = [...(await detailsForTitles(okTitles).catch(() => [])), ...randoms];
  // dédoublonne et complète si besoin
  const seen = new Set();
  cards = cards.filter(c => !seen.has(c.id) && seen.add(c.id));
  let guard = 0;
  while (cards.length < n && guard++ < 3) {
    for (const c of await randomCards(n - cards.length)) if (!seen.has(c.id)) { seen.add(c.id); cards.push(c); }
  }
  return cards.slice(0, n);
}

// ---------------------------------------------------------------- Rendu carte

function cardHTML(card, opts = {}) {
  const r = rarityOf(card);
  const { atk, def } = statsOf(card);
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
        <span class="atk">⚔ ${atk}</span>
        <span class="views">👁 ${compact(card.v)}</span>
        <span class="def">🛡 ${def}</span>
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
  if (view === 'duel' && !duel) renderDuelSetup();
  if (view === 'market') renderMarket();
  if (view === 'profile') renderProfile();
}
document.querySelectorAll('.tab').forEach(t => t.addEventListener('click', () => show(t.dataset.view)));

function renderWallet() { $('#wallet').textContent = fmt(state.money); }

// ---------------------------------------------------------------- Boosters

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
  $('#stock').textContent = state.stock;
  $('#stock-max').textContent = STOCK_MAX;
  $('#stock-bar-fill').style.width = (state.stock / STOCK_MAX * 100) + '%';
  if (state.stock >= STOCK_MAX) {
    $('#stock-timer').textContent = 'Stock plein — ouvre-les !';
  } else {
    const left = REGEN_MS - (now() - state.lastRegen);
    const m = Math.floor(left / 60000), s = Math.floor(left % 60000 / 1000);
    $('#stock-timer').textContent = `Prochain booster dans ${m}:${String(s).padStart(2, '0')}`;
  }
  const busy = opening;
  $('#open-btn').disabled = busy || state.stock < 1;
  $('#buy-booster-btn').disabled = busy || state.money < BOOSTER_PRICE;
  $('#pack').classList.toggle('disabled', busy || state.stock < 1);
}

$('#rarity-list').innerHTML = RARITIES.map((r, i) => {
  const next = RARITIES[i + 1];
  const range = next ? `${fmt(r.min)} – ${fmt(next.min - 1)} vues` : `${fmt(r.min)}+ vues`;
  return `<li class="r-${r.id}"><span><span class="dot"></span>${r.name}</span><span class="muted">${range} · vente ₩${r.sell}</span></li>`;
}).join('');
$('#booster-price').textContent = BOOSTER_PRICE;

let opening = false;
let prefetched = null;
function prefetchBooster() {
  if (!prefetched) prefetched = drawCards(BOOSTER_SIZE).catch(() => { prefetched = null; return null; });
}

async function openBooster(paid) {
  if (opening) return;
  if (!paid && state.stock < 1) return toast('Plus de booster en stock. Patiente un peu ou achètes-en un !', 'bad');
  if (paid && state.money < BOOSTER_PRICE) return toast('Pas assez de wikibidous.', 'bad');
  opening = true;
  renderStock();
  const pack = $('#pack');
  pack.classList.add('opening');
  $('#reveal').classList.add('hidden');
  try {
    prefetchBooster();
    const [cards] = await Promise.all([prefetched, sleep(900)]);
    prefetched = null;
    if (!cards || !cards.length) throw new Error('vide');
    if (paid) addMoney(-BOOSTER_PRICE); else state.stock--;
    state.stats.opened++;
    save();
    showReveal(cards);
    prefetchBooster();
  } catch (e) {
    console.error(e);
    toast('Impossible de joindre Wikipédia. Vérifie ta connexion et réessaie.', 'bad');
    opening = false;
  } finally {
    pack.classList.remove('opening');
    renderStock();
  }
}

function showReveal(cards) {
  // la meilleure carte en dernier, pour le suspense
  cards.sort((a, b) => a.v - b.v);
  const row = $('#reveal-row');
  row.innerHTML = cards.map((c, i) => `
    <div class="flip r-${rarityOf(c).id}" data-i="${i}">
      <div class="flip-inner">
        <div class="flip-front"><div class="card-back" style="animation-delay:${i * 90}ms">W</div></div>
        <div class="flip-back">${cardHTML(c, { isNew: !state.cards[c.id], hideCount: true })}</div>
      </div>
    </div>`).join('');
  $('#reveal').classList.remove('hidden');
  $('#reveal-done').classList.add('hidden');
  $('#reveal-hint').textContent = 'Clique sur les cartes pour les retourner';
  let flipped = 0;
  row.querySelectorAll('.flip').forEach(el => el.addEventListener('click', () => {
    if (el.classList.contains('flipped')) return openDetail(cards[el.dataset.i]);
    el.classList.add('flipped');
    const c = cards[el.dataset.i];
    const t = tierOf(c);
    if (t >= 3) toast(`✨ <b>${esc(rarityOf(c).name)}</b> : ${esc(c.t)} !`, 'gold');
    if (++flipped === cards.length) finishReveal(cards);
  }));
  $('#reveal-done').onclick = () => {
    $('#reveal').classList.add('hidden');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };
  $('#reveal').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function finishReveal(cards) {
  let newOnes = 0;
  for (const c of cards) {
    const prev = state.cards[c.id];
    if (prev) { prev.n++; Object.assign(prev, c, { n: prev.n, at: prev.at }); }
    else { state.cards[c.id] = { ...c, n: 1, at: now() }; newOnes++; }
  }
  save();
  checkAchievements();
  opening = false;
  renderStock();
  $('#reveal-hint').textContent = newOnes
    ? `${newOnes} nouvelle${newOnes > 1 ? 's' : ''} carte${newOnes > 1 ? 's' : ''} pour ton album !`
    : 'Que des doublons… tu peux les revendre dans l\'album.';
  $('#reveal-done').classList.remove('hidden');
}

$('#pack').addEventListener('click', () => openBooster(false));
$('#pack').addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openBooster(false); } });
$('#open-btn').addEventListener('click', () => openBooster(false));
$('#buy-booster-btn').addEventListener('click', () => openBooster(true));

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
  if (!confirm(`Vendre ${n} doublon${n > 1 ? 's' : ''} pour ₩${gain} ?`)) return;
  state.stats.sold += n;
  addMoney(gain);
  save();
  checkAchievements();
  toast(`+₩${gain} pour ${n} doublon${n > 1 ? 's' : ''}`, 'good');
  renderAlbum();
});

// ---------------------------------------------------------------- Détail

function openDetail(card, opts = {}) {
  if (!card) return;
  const owned = state.cards[card.id];
  const r = rarityOf(card);
  const { atk, def } = statsOf(card);
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
          <dt>Attaque / Défense</dt><dd>⚔ ${atk} · 🛡 ${def}</dd>
          <dt>Valeur de revente</dt><dd>₩${r.sell}</dd>
          ${owned ? `<dt>Exemplaires</dt><dd>${owned.n}</dd><dt>Obtenue le</dt><dd>${new Date(owned.at).toLocaleDateString('fr-FR')}</dd>` : ''}
        </dl>
        <div class="row">
          <a class="btn" href="${url}" target="_blank" rel="noopener">Lire sur Wikipédia ↗</a>
          ${owned && !opts.readOnly ? `<button class="btn" id="sell-one">Vendre 1 · ₩${r.sell}</button>` : ''}
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
    toast(`+₩${r.sell}`, 'good');
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
  if (paid && state.money < MARKET_REFRESH_PRICE) return toast('Pas assez de wikibidous.', 'bad');
  marketLoading = true;
  $('#market-grid').innerHTML = '<p class="empty"><span class="loader"></span> Les marchands installent leurs étals…</p>';
  try {
    const cards = await drawCards(6, 2.5);
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
        ${o.sold ? 'Vendu' : `Acheter · ₩${o.price}`}${state.cards[o.card.id] && !o.sold ? ' (déjà possédée)' : ''}
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

// ---------------------------------------------------------------- Duel

let deck = [];
let duel = null;

function renderDuelSetup() {
  $('#duel-setup').classList.remove('hidden');
  $('#duel-arena').classList.add('hidden');
  const all = Object.values(state.cards).sort((a, b) => tierOf(b) - tierOf(a) || b.v - a.v);
  deck = deck.filter(id => state.cards[id]);
  $('#deck-slots').innerHTML = [0, 1, 2].map(i => {
    const c = state.cards[deck[i]];
    return c ? cardHTML(c, { hideCount: true, extraAttr: 'data-slot="1"' }) : `<div class="slot">Carte ${i + 1}</div>`;
  }).join('');
  $('#duel-pick').innerHTML = all.map(c => cardHTML(c, { hideCount: true }).replace('class="card ', `class="card ${deck.includes(c.id) ? 'selected ' : ''}`)).join('');
  $('#duel-empty').classList.toggle('hidden', all.length >= 3);
  $('#duel-start').disabled = deck.length !== 3;
  $('#duel-auto').disabled = all.length < 3;
}

$('#duel-pick').addEventListener('click', e => {
  const el = e.target.closest('.card');
  if (!el) return;
  const id = +el.dataset.id;
  if (deck.includes(id)) deck = deck.filter(x => x !== id);
  else if (deck.length < 3) deck.push(id);
  else toast('Ton deck est complet (3 cartes). Retire une carte d\'abord.');
  renderDuelSetup();
});
$('#deck-slots').addEventListener('click', e => {
  const el = e.target.closest('.card');
  if (el) { deck = deck.filter(x => x !== +el.dataset.id); renderDuelSetup(); }
});
$('#duel-auto').addEventListener('click', () => {
  deck = Object.values(state.cards).sort((a, b) => {
    const sa = statsOf(a), sb = statsOf(b);
    return (sb.atk + sb.def) - (sa.atk + sa.def);
  }).slice(0, 3).map(c => c.id);
  renderDuelSetup();
});

$('#duel-start').addEventListener('click', async () => {
  const btn = $('#duel-start');
  btn.disabled = true;
  btn.innerHTML = '<span class="loader"></span> Recherche d\'un adversaire…';
  try {
    const mine = deck.map(id => state.cards[id]);
    const avgTier = mine.reduce((a, c) => a + tierOf(c), 0) / 3;
    const botCards = await drawCards(3, 1 + avgTier * 0.6);
    if (botCards.length < 3) throw new Error('pas assez de cartes');
    startDuel(mine, botCards);
  } catch (e) {
    console.error(e);
    toast('Impossible de trouver un adversaire (Wikipédia injoignable).', 'bad');
  }
  btn.textContent = 'Lancer le duel';
  btn.disabled = deck.length !== 3;
});

function startDuel(mine, bot) {
  duel = {
    mine, bot, round: 0, hp: { me: 100, bot: 100 }, errors: 0,
    level: +$('#duel-level').value,
  };
  $('#duel-setup').classList.add('hidden');
  $('#duel-arena').classList.remove('hidden');
  $('#duel-log').innerHTML = '';
  playRound();
}

function renderArena() {
  const d = duel;
  $('#arena-me').innerHTML = cardHTML(d.mine[d.round], { hideCount: true });
  $('#arena-bot').innerHTML = cardHTML(d.bot[d.round], { hideCount: true });
  $('#duel-round').textContent = `Manche ${d.round + 1} / 3`;
  renderHP();
}

function renderHP() {
  for (const who of ['me', 'bot']) {
    const hp = Math.max(0, duel.hp[who]);
    $(`#hp-${who}`).style.width = hp + '%';
    $(`#hp-${who}-txt`).textContent = `${hp} PV`;
  }
}

function log(msg, cls = '') {
  const li = document.createElement('li');
  li.className = cls;
  li.innerHTML = msg;
  $('#duel-log').appendChild(li);
}

function hitAnim(who) {
  const el = $(`#arena-${who} .card`);
  if (!el) return;
  el.classList.remove('hit'); void el.offsetWidth; el.classList.add('hit');
}

function damage(attacker, defender) {
  return Math.max(5, statsOf(attacker).atk - Math.floor(statsOf(defender).def / 2));
}

async function playRound() {
  const d = duel;
  renderArena();
  const myCard = d.mine[d.round], botCard = d.bot[d.round];

  // Ton tour
  const ok = await askQuestion(myCard);
  if (ok) {
    const dmg = damage(myCard, botCard);
    d.hp.bot -= dmg;
    hitAnim('bot');
    log(`✔ Bonne réponse ! « ${esc(myCard.t)} » inflige <b>${dmg}</b> dégâts.`, 'good');
  } else {
    d.errors++;
    const dmg = damage(botCard, myCard);
    d.hp.me -= dmg;
    hitAnim('me');
    log(`✘ Mauvaise réponse… tu perds <b>${dmg}</b> PV.`, 'bad');
  }
  renderHP();
  if (await checkEnd()) return;

  // Tour de l'IA
  $('#question').innerHTML = `<h3>L'IA réfléchit à une question sur « ${esc(botCard.t)} »… <span class="loader"></span></h3>`;
  await sleep(1400);
  const botOk = Math.random() < d.level;
  if (botOk) {
    const dmg = damage(botCard, myCard);
    d.hp.me -= dmg;
    hitAnim('me');
    log(`🤖 L'IA répond juste sur « ${esc(botCard.t)} » et t'inflige <b>${dmg}</b> dégâts.`, 'bad');
  } else {
    const dmg = damage(myCard, botCard);
    d.hp.bot -= dmg;
    hitAnim('bot');
    log(`🤖 L'IA se trompe sur « ${esc(botCard.t)} » et perd <b>${dmg}</b> PV.`, 'good');
  }
  renderHP();
  await sleep(900);
  if (await checkEnd()) return;

  d.round++;
  if (d.round >= 3) return endDuel();
  playRound();
}

async function checkEnd() {
  if (duel.hp.me <= 0 || duel.hp.bot <= 0) { await sleep(500); endDuel(); return true; }
  return false;
}

function endDuel() {
  const d = duel;
  const me = Math.max(0, d.hp.me), bot = Math.max(0, d.hp.bot);
  let title, reward, cls;
  if (me > bot) {
    reward = 20 + d.bot.reduce((a, c) => a + tierOf(c) * 4, 0) + (d.errors === 0 ? 15 : 0);
    title = '🏆 Victoire !'; cls = 'good';
    state.stats.wins++;
    if (d.errors === 0) state.stats.perfect++;
  } else if (me === bot) {
    reward = 8; title = '🤝 Égalité'; cls = '';
    state.stats.draws++;
  } else {
    reward = 3; title = '💀 Défaite'; cls = 'bad';
    state.stats.losses++;
  }
  addMoney(reward);
  save();
  checkAchievements();
  $('#question').innerHTML = `
    <h3 class="${cls}">${title}</h3>
    <p>${fmt(me)} PV contre ${fmt(bot)} PV${d.errors === 0 && me > bot ? ' — sans aucune erreur !' : ''}. Tu gagnes <b>₩${reward}</b>.</p>
    <p class="muted small">Cartes de l'IA : ${d.bot.map(c => `<a href="#" data-bot="${c.id}">${esc(c.t)}</a> (${rarityOf(c).name})`).join(', ')}</p>
    <div class="row"><button class="btn primary" id="duel-again">Rejouer</button><button class="btn" id="duel-back">Changer de deck</button></div>`;
  $('#question').querySelectorAll('[data-bot]').forEach(a => a.addEventListener('click', e => {
    e.preventDefault();
    openDetail(d.bot.find(c => String(c.id) === a.dataset.bot), { readOnly: true });
  }));
  $('#duel-again').onclick = () => { duel = null; renderDuelSetup(); $('#duel-start').click(); };
  $('#duel-back').onclick = () => { duel = null; renderDuelSetup(); };
}

// ----- Génération des questions

function stripTitle(title) { return title.replace(/\s*\(.*\)\s*$/, ''); }

function maskTitle(text, title) {
  const words = stripTitle(title).split(/[\s'’\-,]+/).filter(w => w.length >= 3);
  let out = text;
  for (const w of words) {
    const re = new RegExp(w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi');
    out = out.replace(re, '▇▇▇');
  }
  return out;
}

function otherCards(card) {
  const pool = [...Object.values(state.cards), ...(duel ? duel.bot : []), ...state.market.offers.map(o => o.card)];
  const seen = new Set([card.id]);
  return shuffle(pool.filter(c => !seen.has(c.id) && seen.add(c.id)));
}

function distractorTitles(card, n) {
  const titles = new Set();
  for (const c of otherCards(card)) { if (titles.size >= n) break; titles.add(c.t); }
  for (const t of shuffle(FALLBACK_TITLES)) { if (titles.size >= n) break; if (t !== card.t) titles.add(t); }
  return [...titles].slice(0, n);
}

const STOP = new Set(['comme', 'notamment', 'également', 'depuis', 'pendant', 'premier', 'première', 'plusieurs', 'contre', 'autres', 'ensuite', 'toutefois', 'cependant', 'lorsque', 'jusqu', 'environ', 'quelques', 'nombreux', 'nombreuses', 'certains', 'entre', 'ainsi', 'avant', 'après']);
const wordsOf = text => (text.match(/[A-Za-zÀ-ÖØ-öø-ÿœŒ]{7,}/g) || []).filter(w => !STOP.has(w.toLowerCase()));

function makeQuestion(card) {
  const types = ['guess', 'blank', 'views'];
  for (const type of shuffle(types)) {
    const q = buildQuestion(type, card);
    if (q) return q;
  }
  return buildQuestion('guess', card);
}

function buildQuestion(type, card) {
  if (type === 'guess') {
    const excerpt = maskTitle(card.x.slice(0, 320), card.t);
    return {
      title: 'De quelle page Wikipédia vient cet extrait ?',
      quote: excerpt + (card.x.length > 320 ? '…' : ''),
      answer: card.t,
      options: shuffle([card.t, ...distractorTitles(card, 3)]),
    };
  }
  if (type === 'blank') {
    const titleWords = new Set(stripTitle(card.t).toLowerCase().split(/\s+/));
    const sentences = card.x.split(/(?<=[.!?])\s+/).filter(s => s.length > 40 && s.length < 260);
    for (const s of shuffle(sentences)) {
      const candidates = wordsOf(s).filter(w => !titleWords.has(w.toLowerCase()) && w[0] === w[0].toLowerCase());
      if (!candidates.length) continue;
      const word = pick(candidates);
      const others = new Set();
      for (const c of otherCards(card)) {
        for (const w of shuffle(wordsOf(c.x))) {
          if (w.toLowerCase() !== word.toLowerCase() && w[0] === w[0].toLowerCase() && !s.includes(w)) { others.add(w); break; }
        }
        if (others.size >= 3) break;
      }
      if (others.size < 3) return null;
      return {
        title: 'Quel mot manque dans cette phrase ?',
        quote: esc(maskTitle(s, card.t)).replace(new RegExp(`(^|[^\\p{L}])${word}(?![\\p{L}])`, 'u'), '$1<span class="blank">&nbsp;</span>'),
        raw: true,
        answer: word,
        options: shuffle([word, ...[...others].slice(0, 3)]),
      };
    }
    return null;
  }
  if (type === 'views') {
    const others = otherCards(card).filter(c => Math.abs(c.v - card.v) > card.v * 0.15 + 10);
    const chosen = [];
    for (const c of others) {
      if (chosen.every(o => Math.abs(o.v - c.v) > o.v * 0.15 + 10)) chosen.push(c);
      if (chosen.length === 3) break;
    }
    if (chosen.length < 3) return null;
    const set = [card, ...chosen];
    const best = set.reduce((a, b) => (b.v > a.v ? b : a));
    return {
      title: 'Laquelle de ces pages a été la plus consultée ces 30 derniers jours ?',
      answer: best.t,
      options: shuffle(set.map(c => c.t)),
      explain: set.sort((a, b) => b.v - a.v).map(c => `${esc(c.t)} : ${fmt(c.v)}`).join(' · '),
    };
  }
  return null;
}

const QUESTION_TIME = 25;

function askQuestion(card) {
  const q = makeQuestion(card);
  return new Promise(resolve => {
    const box = $('#question');
    box.innerHTML = `
      <div class="muted small">Ta carte : <b>${esc(card.t)}</b></div>
      <h3>${esc(q.title)}</h3>
      ${q.quote ? `<blockquote>${q.raw ? q.quote : esc(q.quote)}</blockquote>` : ''}
      <div class="answers">${q.options.map(o => `<button class="btn" data-o="${esc(o)}">${esc(o)}</button>`).join('')}</div>
      <div class="timerbar"><div id="qtimer"></div></div>`;
    let done = false;
    const bar = $('#qtimer');
    bar.style.transition = `width ${QUESTION_TIME}s linear`;
    requestAnimationFrame(() => requestAnimationFrame(() => { bar.style.width = '0%'; }));
    const finish = async chosen => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      const ok = chosen === q.answer;
      box.querySelectorAll('[data-o]').forEach(b => {
        b.disabled = true;
        if (b.dataset.o === q.answer) b.classList.add('right');
        else if (b.dataset.o === chosen) b.classList.add('wrong');
      });
      bar.style.transition = 'none';
      if (chosen === null) log('⏱ Temps écoulé !', 'bad');
      if (q.explain) box.insertAdjacentHTML('beforeend', `<p class="muted small">${q.explain}</p>`);
      await sleep(q.explain ? 2200 : 1300);
      resolve(ok);
    };
    const timer = setTimeout(() => finish(null), QUESTION_TIME * 1000);
    box.querySelectorAll('[data-o]').forEach(b => b.addEventListener('click', () => finish(b.dataset.o)));
  });
}

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
    ['Valeur de l\'album', '₩' + fmt(value)],
    ['Boosters ouverts', fmt(state.stats.opened)],
    ['Duels', `${state.stats.wins} V · ${state.stats.draws} N · ${state.stats.losses} D`],
    ['Wikibidous gagnés', '₩' + fmt(state.stats.earned)],
    ['Meilleure carte', best ? esc(best.t) : '—'],
  ];
  $('#stats').innerHTML = stats.map(([k, v]) => `<div class="stat"><b>${v}</b><span>${k}</span></div>`).join('');
  $('#achievements').innerHTML = ACHIEVEMENTS.map(a => `
    <div class="ach ${state.achievements[a.id] ? 'done' : ''}">
      <span class="ico">${a.ico}</span><div><b>${esc(a.name)}</b><small>${esc(a.desc)}</small></div>
    </div>`).join('');
}

$('#export-save').addEventListener('click', () => {
  const blob = new Blob([JSON.stringify(state)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `wikimaster-${new Date().toISOString().slice(0, 10)}.json`;
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
  deck = [];
  save();
  renderAll();
  toast('Nouvelle partie commencée.');
});

// ---------------------------------------------------------------- Boucle

function renderAll() {
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
