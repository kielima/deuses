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

// 1) Cria um ruleset com o conteúdo das regras.
const ruleset = await client.request({
  url: `${base}/projects/${projectId}/rulesets`,
  method: 'POST',
  data: { source: { files: [{ name: 'firestore.rules', content: source }] } },
});
const rulesetName = ruleset.data.name; // projects/<id>/rulesets/<uuid>
console.log('Ruleset criado:', rulesetName);

// 2) Aponta o release "cloud.firestore" para o novo ruleset (PATCH; se não
//    existir, cria com POST).
const releaseName = `projects/${projectId}/releases/cloud.firestore`;
try {
  await client.request({
    url: `${base}/${releaseName}`,
    method: 'PATCH',
    data: { release: { name: releaseName, rulesetName } },
  });
  console.log('Release atualizado:', releaseName);
} catch (e) {
  const code = e.response?.status;
  if (code === 404) {
    await client.request({
      url: `${base}/projects/${projectId}/releases`,
      method: 'POST',
      data: { name: releaseName, rulesetName },
    });
    console.log('Release criado:', releaseName);
  } else {
    console.error('Falha ao atualizar release:', code, JSON.stringify(e.response?.data || e.message));
    process.exit(1);
  }
}
console.log('✓ Regras publicadas.');
