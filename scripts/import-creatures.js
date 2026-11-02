#!/usr/bin/env node
/** Importa data/creatures.seed.json -> Firestore entries/creatures/items. Dry-run por padrão; --apply grava. Ver lib-import-generic.js. */
require("./lib-import-generic").runSimple('creatures','criaturas').catch(e => { console.error("Erro:", e.message); process.exit(1); });
