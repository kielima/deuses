#!/usr/bin/env node
/**
 * Importa data/religions.seed.json para Firestore em entries/religions/items/{id}.
 * O id do documento = campo "id" (slug) de cada entrada, para que os `links`
 * entre tradições resolvam por id de forma estável.
 *
 * Pré-requisitos:
 *   npm install firebase-admin
 *   Credenciais via GOOGLE_APPLICATION_CREDENTIALS (caminho do serviceAccount.json)
 *   ou --key <serviceAccount.json>.
 *
 * Uso:
 *   node scripts/import-religions.js --key serviceAccount.json [--dry-run] [--merge]
 *
 * Marca cada doc com is_seed:true (distingue da base criada por utilizadores).
 * Corre o validador antes de importar; aborta se houver erros.
 */
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const args = process.argv.slice(2);
const opt = (name) => { const i = args.indexOf(name); return i >= 0 ? (args[i + 1] && !args[i + 1].startsWith('--') ? args[i + 1] : true) : undefined; };
const DRY = !!opt('--dry-run');
const MERGE = !!opt('--merge');
const KEY = opt('--key');
const FILE = path.join(__dirname, '..', 'data', 'religions.seed.json');

// 1) Validar primeiro
try {
  execFileSync('node', [path.join(__dirname, 'validate-religions.js'), FILE], { stdio: 'inherit' });
} catch (e) {
  console.error('\nValidação falhou — import abortado.');
  process.exit(1);
}

const data = JSON.parse(fs.readFileSync(FILE, 'utf8'));

if (DRY) {
  console.log(`\n[dry-run] ${data.length} documentos seriam gravados em entries/religions/items.`);
  process.exit(0);
}

const admin = require('firebase-admin');
if (typeof KEY === 'string') {
  admin.initializeApp({ credential: admin.credential.cert(require(path.resolve(KEY))) });
} else {
  admin.initializeApp(); // usa GOOGLE_APPLICATION_CREDENTIALS
}
const db = admin.firestore();
const col = db.collection('entries').doc('religions').collection('items');
const now = admin.firestore.FieldValue.serverTimestamp();

(async () => {
  let batch = db.batch();
  let n = 0;
  for (const e of data) {
    const { id, ...rest } = e;
    const doc = {
      ...rest,
      links: Array.isArray(e.links) ? e.links : [],
      is_seed: true,
      createdAt: now,
      lastEditedAt: now,
    };
    batch.set(col.doc(id), doc, { merge: MERGE });
    if (++n % 400 === 0) { await batch.commit(); batch = db.batch(); }
  }
  await batch.commit();
  console.log(`✓ Importadas ${n} tradições para entries/religions/items (merge=${MERGE}).`);
  process.exit(0);
})().catch(e => { console.error('Erro no import:', e.message); process.exit(1); });
