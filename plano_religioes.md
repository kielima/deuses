# Plano — Religiões na base "Deuses" (v2, alinhado ao app real)

> **Mudança de premissa face ao plano original.** O plano `plano_base_tradicoes.md` foi escrito
> assumindo que era preciso criar do zero um esquema (`traditions` + `relations`) num app a definir.
> Depois de ler o código real (`index.html`, `firestore.rules`), confirma-se que **grande parte
> já existe**: o app é uma enciclopédia colaborativa e a categoria **`religions` já está implementada**.
> Este documento substitui o plano original e descreve o que falta de facto fazer.

## 1. O que o app já tem (e que o plano original ignorava)

- **App:** SPA num único `index.html` (Vanilla JS + Chart.js + `marked` + `DOMPurify`), backend
  **Firestore + Auth**, deploy via Firebase Hosting (projeto `deuses-app`). PWA com service worker.
- **Enciclopédia interligada já genérica.** Além de `deities`, existem 4 categorias-irmãs
  (`index.html:700-710`): **`religions`** 🕊️, `plants`, `animals`, `creatures`. Cada uma é uma aba
  no topo e partilha exatamente o mesmo modelo de registo, modal de edição, página Markdown,
  comentários, histórico e papéis.
- **Coleção das religiões:** `entries/religions/items/{id}` (carregada por `loadGeneric()`,
  `index.html:1146-1153`; guardada em `genericStore.religions`).
- **Modelo de registo** (campos reais, curtos — `index.html:1268-1273`, `createDeity` 1488-1507):
  | Campo | Significado para religiões (rótulos em `CATEGORIES.religions`) |
  |---|---|
  | `n`   | Nome |
  | `c`   | **Tradição / Família** (ex.: "Abraâmica", "Dhármica") |
  | `g`   | **Tipo** (ex.: religião, filosofia, ordem, movimento) |
  | `p`   | **Divindade principal** |
  | `geo` | **Região** |
  | `d`   | Descrição curta |
  | `review` | **Texto longo em Markdown** (a "página própria") |
  | `links` | `array<{cat,id,rel}>` — **associações cross-categoria** (substitui a coleção `relations`) |
  | `_new`, `_deleted`, `createdBy/At`, `lastEditedBy/At` | metadados (já tratados pelo app) |
- **Relações já existem como `links`.** Cada entrada referencia outras (incl. **deidades**) com
  `{cat, id, rel}`. A combobox de associação (`index.html:1306-1314`, `fillLinkTargets`,
  `gotoEntry`) já permite ligar uma religião a deidades/outras religiões com um rótulo de relação
  livre. Isto cobre o caso "vincular deidades por ID" do plano original — sem coleção nova.
- **Criação via app já existe.** O botão "➕ Nova religião" abre o modal de criação
  (`openCreateModal`/`createDeity`), grava em `entries/religions/items/{id}` com validação mínima
  (nome obrigatório).
- **Segurança e papéis já existem** (`firestore.rules:61-82`): `master` cria/edita tudo,
  `admin` edita só `review`/`links`, `editor` comenta, `viewer` lê. Já cobre o requisito de
  "Security Rules para escrita pelo utilizador" do plano original.
- **Markdown e busca já existem:** `mdToHtml` (`index.html:1522-1525`) renderiza a página;
  `applyFilters()` (`index.html:730-747`) faz busca em tempo real por nome.

**Conclusão:** não há esquema novo a desenhar nem app a construir. O trabalho real é **popular a
categoria `religions` com dados** e, opcionalmente, **melhorar a visualização** (timeline) e
**afinar a relação entre `links` e os tipos de relação**.

## 2. Decisões revistas

- **Sem coleção `traditions` nova** → usar `entries/religions/items`.
- **Sem coleção `relations` nova** → usar o campo `links: [{cat,id,rel}]` já existente.
- **Mapear o esquema rico proposto** para os 4 campos genéricos + `review`:
  - `category` → `c`; `type` → `g`; `region` → `geo`; deidade principal → `p`.
  - `period_start`/`period_end`/`status`/`sources`/`name_en` → **dentro do `review` (Markdown)**
    numa secção padronizada, OU (ver §6) adicionar campos extra ao registo se quisermos a timeline.
- **Deidades (plural, 0..n)** → **todas** as deidades de uma tradição entram por `links` com
  `cat:"deities"` (uma religião pode ter 0 — filosofias —, 1 ou várias). Deixou de existir o campo
  único "divindade principal".

### Decisões finais (implementadas no código)

- **3º campo (`p`/f3) das religiões removido** do formulário (`CATEGORIES.religions.f3 = ''`): as
  religiões usam só Tradição/Família (`c`), Tipo (`g`) e Região (`geo`) + associações.
- **Campos de período estruturados (opção b)** adicionados ao modelo genérico, ativos por
  `CATEGORIES.<cat>.period`:
  - `ps` — ano de início (número; negativo = a.C.)
  - `pe` — ano de fim (número; vazio/null = ainda ativa)
  - `pf` — booleano "início incerto/difuso" (para barra tracejada na timeline)
  Editáveis só pelo `master` (como os outros campos de detalhe); sem alteração às `firestore.rules`.
- **Profundidade:** começar por um **núcleo curado (~100–150)** e expandir depois.

## 3. Tipos de relação (`rel`) sugeridos

O campo `rel` é texto livre hoje. Para a timeline-grafo do plano original, padronizar valores:
`descende de`, `influenciada por`, `cisma de`, `sincretismo de`, `revival de`, `venera` (→ deidade).
Não exige mudança de código; é convenção de preenchimento (e habilita cor por tipo na timeline).

## 4. Fases de execução (revistas)

- **Fase 0 — Referência.** (Como no original) baixar/remontar o infográfico de Simon E. Davies
  só como **fonte de leitura** dos nomes/ramos. Não é dado estruturado.
- **Fase 1 — Transcrição.** Ler a árvore e produzir um rascunho JSON **já no formato do app**
  (`{n,c,g,p,geo,d,review,links}`), não no esquema `traditions`.
- **Fase 2 — Validação/enriquecimento.** Conferir nomes/datas/relações contra consenso académico;
  escrever o `review` (Markdown) com secção padrão: resumo, período, região, fontes, `name_en`.
- **Fase 3 — Expansão.** Acrescentar filosofias, ocultismo/esoterismo e movimentos modernos como
  entradas `religions` (campo `g`=Tipo distingue religião/filosofia/ordem/movimento).
- **Fase 4 — Vínculo com deidades.** Preencher `links` com `cat:"deities"` para as divindades de
  cada tradição (a combobox já resolve o id pelo nome).
- **Fase 5 — Carga no Firestore.** Script de import para `entries/religions/items` (cada doc =
  uma religião) + validador de integridade (ids órfãos em `links`, deidades inexistentes).
  Só `master` pode semear (regras atuais).
- **Fase 6 — Visualização.** Opcional/maior: a timeline-grafo do plano original como **nova vista**
  por cima de `entries/religions/items` + `links`. Requer datas estruturadas → ver §6.

## 5. Entregáveis

- `religions.import.json` (array de docs no formato do app) + script de carga + validador.
- Convenção de `rel` (§3) e template de `review` (secções padronizadas).
- (Opcional) protótipo da vista timeline.
- Relatório de cobertura: o que veio da árvore vs. adicionado, com fontes.

## 6. Decisões resolvidas / em aberto

- ✅ **Timeline:** opção **b** — campos de período estruturados (`ps`/`pe`/`pf`) já no código.
- ✅ **Profundidade:** núcleo curado (~100–150) primeiro.
- ✅ **Deidades:** plural/opcional via `links` (sem campo "divindade principal").
- ⏳ **Idioma:** o app é PT. `name_en` fica no `review` por agora (sem campo próprio) — rever se necessário.
- ⏳ **`rel` padronizado (§3):** confirmar a lista de tipos de relação antes de popular os dados.

## 7. Riscos / notas

- **Fidelidade vs. correção:** onde o infográfico divergir do consenso, sigo o consenso e sinalizo.
- **Tipo ambíguo (gnosticismo etc.):** resolvido por `c` (família) + `g` (tipo); casos-limite ficam
  para tua decisão.
- **Direitos:** reconstruir *dados* é livre; não copiar a *imagem* de Simon E. Davies no app
  (creditar a fonte).
- **Duplicados:** a busca por nome ajuda a evitar criar religião já existente; rever antes de semear.

---
*Substitui `plano_base_tradicoes.md`. Fonte da árvore: "The Evolutionary Tree of Myth & Religions,
v2.0", Simon E. Davies (Human Odyssey). Alinhado a `index.html` (categoria `religions`) e
`firestore.rules`.*
