/**
 * Biblioteca comum dos importadores de pesquisas (animals, creatures, plants, deities).
 * NÃO é executável sozinha; use scripts/import-<categoria>.js.
 *
 * Segurança: o padrão é DRY-RUN (só valida e conta). Para gravar de verdade é
 * preciso passar --apply (e credenciais). A importação real fica com a Kiê.
 *
 * Opções:
 *   --apply            grava no Firestore (sem isto, é sempre dry-run)
 *   --key <arquivo>    serviceAccount.json (ou GOOGLE_APPLICATION_CREDENTIALS)
 *   --merge            set(..., {merge:true}) em vez de sobrescrever
 *   --file <json>      outro arquivo de dados
 *   --path <caminho>   (só deities) coleção, padrão entries/deities/items
 */
const fs = require('fs');
const path = require('path');

const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const norm = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

function parseArgs(argv) {
  const opt = (name) => { const i = argv.indexOf(name); return i >= 0 ? (argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : true) : undefined; };
  return { APPLY: !!opt('--apply'), MERGE: !!opt('--merge'), KEY: opt('--key'), FILE: opt('--file'), PATH: opt('--path') };
}

function validate(data, label) {
  const errors = [];
  if (!Array.isArray(data)) return ['O topo do JSON tem de ser um array.'];
  const ids = new Set();
  data.forEach((e, i) => {
    const at = `${label} #${i} (${e && e.id ? e.id : 'sem id'})`;
    if (!e || typeof e !== 'object') { errors.push(`${at}: não é objeto`); return; }
    if (typeof e.id !== 'string' || !SLUG_RE.test(e.id)) errors.push(`${at}: id inválido (slug a-z0-9 e hífens)`);
    else if (ids.has(e.id)) errors.push(`${at}: id duplicado`);
    else ids.add(e.id);
    if (typeof e.n !== 'string' || !e.n.trim()) errors.push(`${at}: "n" em falta`);
    if (typeof e.review !== 'string' || !e.review.trim()) errors.push(`${at}: "review" em falta`);
    ['c', 'g', 'geo', 'd'].forEach(k => { if (e[k] != null && typeof e[k] !== 'string') errors.push(`${at}: "${k}" deve ser string`); });
    if (e.links != null && !Array.isArray(e.links)) errors.push(`${at}: links deve ser array`);
  });
  return errors;
}

function initAdmin(KEY) {
  const admin = require('firebase-admin');
  if (typeof KEY === 'string') admin.initializeApp({ credential: admin.credential.cert(require(path.resolve(KEY))) });
  else admin.initializeApp();
  return admin;
}

/** Importador simples: entries/<cat>/items/{id} (mesmo padrão de import-religions.js). */
async function runSimple(cat, label) {
  const A = parseArgs(process.argv.slice(2));
  const FILE = typeof A.FILE === 'string' ? A.FILE : path.join(__dirname, '..', 'data', `${cat}.seed.json`);
  const data = JSON.parse(fs.readFileSync(FILE, 'utf8'));
  const errors = validate(data, label);
  if (errors.length) { errors.forEach(x => console.error('  ✗ ' + x)); console.error(`\nValidação falhou (${errors.length} erros) — abortado.`); process.exit(1); }
  console.log(`✓ ${label}: ${data.length} entradas válidas em ${path.basename(FILE)}.`);
  if (!A.APPLY) { console.log(`[dry-run] ${data.length} documentos seriam gravados em entries/${cat}/items. Nada foi gravado (use --apply para importar).`); return; }

  const admin = initAdmin(A.KEY);
  const db = admin.firestore();
  const col = db.collection('entries').doc(cat).collection('items');
  const now = admin.firestore.FieldValue.serverTimestamp();
  let batch = db.batch(), n = 0;
  for (const e of data) {
    const { id, ...rest } = e;
    batch.set(col.doc(id), { ...rest, links: Array.isArray(e.links) ? e.links : [], is_seed: true, createdAt: now, lastEditedAt: now }, { merge: A.MERGE });
    if (++n % 400 === 0) { await batch.commit(); batch = db.batch(); }
  }
  await batch.commit();
  console.log(`✓ Importadas ${n} entradas para entries/${cat}/items (merge=${A.MERGE}).`);
}

/**
 * Importador de deidades. Regra da Kiê:
 *  - deidade que JÁ existe na base (casamento por nome normalizado, "n") -> o texto
 *    importado entra no campo "review" (Revisão), sem apagar o que já existe lá;
 *  - deidade que NÃO existe -> cria como deidade nova (id = slug).
 * Para saber o que existe, precisa ler o Firestore: com --key lê (também no dry-run,
 * só leitura); sem --key o dry-run apenas valida o arquivo.
 */
async function runDeities() {
  const A = parseArgs(process.argv.slice(2));
  const FILE = typeof A.FILE === 'string' ? A.FILE : path.join(__dirname, '..', 'data', 'deities.seed.json');
  if (!fs.existsSync(FILE)) { console.error(`Arquivo ${FILE} não existe — dados das deidades ainda não foram extraídos do Drive.`); process.exit(1); }
  const data = JSON.parse(fs.readFileSync(FILE, 'utf8'));
  const errors = validate(data, 'deidades');
  if (errors.length) { errors.forEach(x => console.error('  ✗ ' + x)); process.exit(1); }
  console.log(`✓ deidades: ${data.length} entradas válidas.`);
  const COL = typeof A.PATH === 'string' ? A.PATH : 'entries/deities/items'; // CONFIRMAR o caminho real no app
  if (!A.APPLY && !A.KEY) { console.log('[dry-run] sem --key não é possível saber quais já existem. Nada foi gravado.'); return; }

  const admin = initAdmin(A.KEY);
  const db = admin.firestore();
  const col = db.collection(COL);
  const existing = new Map();
  (await col.get()).forEach(d => { const v = d.data(); if (!v._deleted) existing.set(norm(v.n), { id: d.id, review: v.review || '' }); });
  const toRevise = [], toCreate = [];
  for (const e of data) (existing.has(norm(e.n)) ? toRevise : toCreate).push(e);
  console.log(`  existentes (viram texto de Revisão): ${toRevise.length}\n  novas (viram deidade nova): ${toCreate.length}`);
  toCreate.slice(0, 50).forEach(e => console.log('    + ' + e.n));
  if (!A.APPLY) { console.log('[dry-run] nada foi gravado (use --apply para importar).'); return; }

  const now = admin.firestore.FieldValue.serverTimestamp();
  let batch = db.batch(), n = 0;
  const flush = async () => { if (++n % 400 === 0) { await batch.commit(); batch = db.batch(); } };
  for (const e of toRevise) {
    const cur = existing.get(norm(e.n));
    const review = cur.review ? `${cur.review}\n\n---\n\n## Pesquisa importada do Drive\n\n${e.review}` : e.review;
    batch.update(col.doc(cur.id), { review, lastEditedAt: now }); await flush();
  }
  for (const e of toCreate) {
    const { id, ...rest } = e;
    batch.set(col.doc(id), { ...rest, links: Array.isArray(e.links) ? e.links : [], is_seed: true, createdAt: now, lastEditedAt: now }); await flush();
  }
  await batch.commit();
  console.log(`✓ ${toRevise.length} revisões atualizadas, ${toCreate.length} deidades criadas em ${COL}.`);
}

module.exports = { runSimple, runDeities, validate, norm };
