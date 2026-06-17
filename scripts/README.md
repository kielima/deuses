# Seed de religiões — import e validação

Popula a categoria **Religiões** (`entries/religions/items/{id}`) com um núcleo curado.

## Ficheiros
- `../data/religions.seed.json` — dataset (array de tradições no formato do app).
- `validate-religions.js` — valida esquema, ids únicos, vocabulário e integridade dos `links`.
- `import-religions.js` — grava no Firestore (corre o validador antes).

## Esquema de cada entrada
| Campo | Tipo | Nota |
|---|---|---|
| `id` | slug | id do documento; alvo dos `links` |
| `n` | string | nome (PT) |
| `c` | string | família (ex.: Abraâmica, Dhármica) → campo f1 |
| `g` | enum | `religião`/`filosofia`/`ordem`/`movimento`/`mitologia`/`seita` → f2 |
| `geo` | string | região → f4 |
| `d` | string | descrição curta |
| `ps`/`pe` | int/null | ano início / fim (negativo = a.C.; pe null = ativa) |
| `pf` | bool | início incerto/difuso (barra tracejada na timeline) |
| `review` | Markdown | página longa |
| `links` | array | `{cat:"religions", id, rel}` — `rel` ∈ {descende de, influenciada por, cisma de, sincretismo de, revival de} |

> Deidades ligam-se **no app** (combobox de associações, `cat:"deities"`), não no seed.

## Como usar
```bash
# validar
node scripts/validate-religions.js

# ensaio (não grava)
node scripts/import-religions.js --key serviceAccount.json --dry-run

# importar (só master deve correr; usa as credenciais do projeto)
npm install firebase-admin
node scripts/import-religions.js --key serviceAccount.json          # cria/substitui
node scripts/import-religions.js --key serviceAccount.json --merge   # merge não-destrutivo
```
Cada doc fica marcado `is_seed:true`.
