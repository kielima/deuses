#!/usr/bin/env node
/** Importa data/deities.seed.json -> Firestore entries/deities/items. Dry-run por padrão; --apply grava. Ver lib-import-generic.js. */
require("./lib-import-generic").runDeities().catch(e => { console.error("Erro:", e.message); process.exit(1); });
