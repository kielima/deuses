// Publica firestore.rules via API REST do Firebase Rules.
// Usa só built-ins do Node (crypto + https) — sem google-auth-library/node-fetch,
// que sofriam "premature close" na descompressão gzip no runner do GitHub.
// Todas as chamadas usam Accept-Encoding: identity e Connection: close (sem
// gzip e sem keep-alive) + retry, para contornar essa flakiness de rede.
//
// Uso: node scripts/deploy-firestore-rules.mjs <sa.json> <projectId> <rules.path>
import { readFileSync } from 'node:fs';
import https from 'node:https';
import crypto from 'node:crypto';

const [saPath, projectId, rulesPath] = process.argv.slice(2);
if (!saPath || !projectId || !rulesPath) {
  console.error('Uso: deploy-firestore-rules.mjs <sa.json> <projectId> <rules.path>');
  process.exit(2);
}
const sa = JSON.parse(readFileSync(saPath, 'utf8'));
const source = readFileSync(rulesPath, 'utf8');

const b64url = b => Buffer.from(b).toString('base64').replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
const sleep = ms => new Promise(r => setTimeout(r, ms));

// Pedido HTTPS sem gzip e sem keep-alive, devolvendo {status, json}.
function request(method, urlStr, headers, body) {
  const u = new URL(urlStr);
  const payload = body == null ? null : Buffer.from(typeof body === 'string' ? body : JSON.stringify(body));
  const opts = {
    method,
    hostname: u.hostname,
    path: u.pathname + u.search,
    headers: {
      'Accept-Encoding': 'identity',
      'Connection': 'close',
      ...(payload ? { 'Content-Length': payload.length } : {}),
      ...headers,
    },
    agent: false,
  };
  return new Promise((resolve, reject) => {
    const req = https.request(opts, res => {
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => {
        const text = Buffer.concat(chunks).toString('utf8');
        let json = null; try { json = text ? JSON.parse(text) : null; } catch {}
        resolve({ status: res.statusCode, json, text });
      });
    });
    req.on('error', reject);
    if (payload) req.write(payload);
    req.end();
  });
}

async function withRetry(fn, label, tries = 6) {
  let last;
  for (let i = 0; i < tries; i++) {
    try {
      const r = await fn();
      if (r.status >= 200 && r.status < 300) return r;
      if (r.status < 500 && r.status !== 429) { // 4xx real → erro definitivo
        throw new Error(`${label}: HTTP ${r.status} ${JSON.stringify(r.json || r.text)}`);
      }
      last = new Error(`${label}: HTTP ${r.status}`);
    } catch (e) {
      if (/HTTP 4\d\d/.test(e.message)) throw e;
      last = e;
    }
    console.warn(`${label}: tentativa ${i + 1} falhou (${last.message}); a repetir…`);
    await sleep(1000 * (i + 1));
  }
  throw last;
}

// 1) Token OAuth via JWT assinado com a chave da service account.
async function getToken() {
  const now = Math.floor(Date.now() / 1000);
  const header = b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const claim = b64url(JSON.stringify({
    iss: sa.client_email,
    scope: 'https://www.googleapis.com/auth/cloud-platform',
    aud: sa.token_uri,
    iat: now, exp: now + 3600,
  }));
  const signingInput = `${header}.${claim}`;
  const sig = b64url(crypto.sign('RSA-SHA256', Buffer.from(signingInput), sa.private_key));
  const assertion = `${signingInput}.${sig}`;
  const form = `grant_type=${encodeURIComponent('urn:ietf:params:oauth:grant-type:jwt-bearer')}&assertion=${assertion}`;
  const r = await withRetry(
    () => request('POST', sa.token_uri, { 'Content-Type': 'application/x-www-form-urlencoded' }, form),
    'token',
  );
  return r.json.access_token;
}

const token = await getToken();
const authHeaders = { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' };
const base = 'https://firebaserules.googleapis.com/v1';

// 2) Cria o ruleset.
const rs = await withRetry(
  () => request('POST', `${base}/projects/${projectId}/rulesets`, authHeaders,
    { source: { files: [{ name: 'firestore.rules', content: source }] } }),
  'ruleset',
);
const rulesetName = rs.json.name;
console.log('Ruleset criado:', rulesetName);

// 3) Aponta o release cloud.firestore para o novo ruleset.
const releaseName = `projects/${projectId}/releases/cloud.firestore`;
const patch = await withRetry(
  () => request('PATCH', `${base}/${releaseName}`, authHeaders, { release: { name: releaseName, rulesetName } }),
  'release-patch',
).catch(e => (/HTTP 404/.test(e.message) ? null : Promise.reject(e)));
if (patch) {
  console.log('Release atualizado:', releaseName);
} else {
  await withRetry(
    () => request('POST', `${base}/projects/${projectId}/releases`, authHeaders, { name: releaseName, rulesetName }),
    'release-create',
  );
  console.log('Release criado:', releaseName);
}
console.log('✓ Regras publicadas.');
