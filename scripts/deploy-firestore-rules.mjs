// Publica firestore.rules via API REST do Firebase Rules, sem o preflight do
// firebase-tools (que exige serviceusage.services.get, permissão que a service
// account de deploy pode não ter). Requer apenas permissão de Firebase Rules.
//
// Uso: node scripts/deploy-firestore-rules.mjs <sa.json> <projectId> <rules.path>
import { GoogleAuth } from 'google-auth-library';
import { readFileSync } from 'node:fs';

const [saPath, projectId, rulesPath] = process.argv.slice(2);
if (!saPath || !projectId || !rulesPath) {
  console.error('Uso: deploy-firestore-rules.mjs <sa.json> <projectId> <rules.path>');
  process.exit(2);
}

const source = readFileSync(rulesPath, 'utf8');
const auth = new GoogleAuth({ keyFile: saPath, scopes: ['https://www.googleapis.com/auth/cloud-platform'] });
const client = await auth.getClient();
const base = 'https://firebaserules.googleapis.com/v1';

const sleep = ms => new Promise(r => setTimeout(r, ms));
// A rede do runner para googleapis sofre "premature close" intermitente;
// repete em erros transientes (rede/5xx), preservando 4xx reais.
async function withRetry(fn, tries = 5) {
  let last;
  for (let i = 0; i < tries; i++) {
    try { return await fn(); }
    catch (e) {
      const status = e.response?.status;
      if (status && status < 500 && status !== 429) throw e; // 4xx real → não repete
      last = e;
      console.warn(`tentativa ${i + 1} falhou (${e.code || status || e.message}); a repetir…`);
      await sleep(1000 * (i + 1));
    }
  }
  throw last;
}

// 1) Cria um ruleset com o conteúdo das regras.
const ruleset = await withRetry(() => client.request({
  url: `${base}/projects/${projectId}/rulesets`,
  method: 'POST',
  data: { source: { files: [{ name: 'firestore.rules', content: source }] } },
}));
const rulesetName = ruleset.data.name; // projects/<id>/rulesets/<uuid>
console.log('Ruleset criado:', rulesetName);

// 2) Aponta o release "cloud.firestore" para o novo ruleset (PATCH; se não
//    existir, cria com POST).
const releaseName = `projects/${projectId}/releases/cloud.firestore`;
try {
  await withRetry(() => client.request({
    url: `${base}/${releaseName}`,
    method: 'PATCH',
    data: { release: { name: releaseName, rulesetName } },
  }));
  console.log('Release atualizado:', releaseName);
} catch (e) {
  const code = e.response?.status;
  if (code === 404) {
    await withRetry(() => client.request({
      url: `${base}/projects/${projectId}/releases`,
      method: 'POST',
      data: { name: releaseName, rulesetName },
    }));
    console.log('Release criado:', releaseName);
  } else {
    console.error('Falha ao atualizar release:', code, JSON.stringify(e.response?.data || e.message));
    process.exit(1);
  }
}
console.log('✓ Regras publicadas.');
