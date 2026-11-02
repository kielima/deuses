#!/usr/bin/env node
/** Importa data/animals.seed.json -> Firestore entries/animals/items. Dry-run por padrão; --apply grava. Ver lib-import-generic.js. */
require("./lib-import-generic").runSimple('animals','animais').catch(e => { console.error("Erro:", e.message); process.exit(1); });
