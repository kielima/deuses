#!/usr/bin/env node
/**
 * Valida data/religions.seed.json antes do import.
 * Checa: esquema dos campos, ids únicos, vocabulário de `g` e `rel`,
 * integridade dos `links` (alvos existem no ficheiro), e coerência de datas.
 *
 * Uso: node scripts/validate-religions.js [caminho.json]
 * Sai com código 1 se houver erros.
 */
const fs = require('fs');
const path = require('path');

const FILE = process.argv[2] || path.join(__dirname, '..', 'data', 'religions.seed.json');
const REL_VOCAB = ['descende de', 'influenciada por', 'cisma de', 'sincretismo de', 'revival de', 'venera'];
const TYPE_VOCAB = ['religião', 'filosofia', 'ordem', 'movimento', 'mitologia', 'seita'];
const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

const errors = [];
const warnings = [];

let raw;
try { raw = fs.readFileSync(FILE, 'utf8'); }
catch (e) { console.error('Não consegui ler', FILE, '-', e.message); process.exit(1); }

let data;
try { data = JSON.parse(raw); }
catch (e) { console.error('JSON inválido:', e.message); process.exit(1); }

if (!Array.isArray(data)) { console.error('O topo do JSON tem de ser um array.'); process.exit(1); }

const ids = new Set();
data.forEach((e, i) => {
  const at = `#${i} (${e && e.id ? e.id : 'sem id'})`;
  if (typeof e !== 'object' || e === null) { errors.push(`${at}: não é objeto`); return; }

  // id
  if (typeof e.id !== 'string' || !SLUG_RE.test(e.id)) errors.push(`${at}: id inválido (slug a-z0-9 e hífens)`);
  else if (ids.has(e.id)) errors.push(`${at}: id duplicado`);
  else ids.add(e.id);

  // strings obrigatórias
  ['n', 'c', 'g', 'geo', 'd', 'review'].forEach(k => {
    if (typeof e[k] !== 'string' || !e[k].trim()) errors.push(`${at}: campo "${k}" em falta ou vazio`);
  });

  // tipo
  if (e.g && !TYPE_VOCAB.includes(e.g)) errors.push(`${at}: g="${e.g}" fora do vocabulário (${TYPE_VOCAB.join(', ')})`);

  // datas
  if (e.ps != null && !Number.isInteger(e.ps)) errors.push(`${at}: ps deve ser inteiro ou null`);
  if (e.pe != null && !Number.isInteger(e.pe)) errors.push(`${at}: pe deve ser inteiro ou null`);
  if (Number.isInteger(e.ps) && Number.isInteger(e.pe) && e.pe < e.ps) errors.push(`${at}: pe (${e.pe}) anterior a ps (${e.ps})`);
  if ('pf' in e && typeof e.pf !== 'boolean') errors.push(`${at}: pf deve ser booleano`);
  if (e.ps == null) warnings.push(`${at}: sem ps (não aparecerá na timeline)`);
});

// links (segunda passagem, já com todos os ids conhecidos)
data.forEach((e, i) => {
  const at = `#${i} (${e && e.id ? e.id : '?'})`;
  if (e.links == null) return;
  if (!Array.isArray(e.links)) { errors.push(`${at}: links deve ser array`); return; }
  e.links.forEach((l, j) => {
    const lat = `${at} link[${j}]`;
    if (typeof l !== 'object' || l === null) { errors.push(`${lat}: não é objeto`); return; }
    if (l.cat !== 'religions') warnings.push(`${lat}: cat="${l.cat}" (seed só valida religions↔religions; deidades ligam-se no app)`);
    if (!REL_VOCAB.includes(l.rel)) errors.push(`${lat}: rel="${l.rel}" fora do vocabulário`);
    if (l.cat === 'religions') {
      if (!ids.has(String(l.id))) errors.push(`${lat}: alvo "${l.id}" não existe no ficheiro (link órfão)`);
      if (String(l.id) === e.id) errors.push(`${lat}: liga a si próprio`);
    }
  });
});

console.log(`Entradas: ${data.length} · ids únicos: ${ids.size}`);
if (warnings.length) { console.log(`\nAvisos (${warnings.length}):`); warnings.forEach(w => console.log('  ⚠ ' + w)); }
if (errors.length) {
  console.log(`\nErros (${errors.length}):`);
  errors.forEach(x => console.log('  ✗ ' + x));
  process.exit(1);
}
console.log('\n✓ Tudo válido.');
