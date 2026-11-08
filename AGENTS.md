# AGENTS.md — service-portal-frontend

Índice para agentes de IA. Leia antes de abrir código. Método: `../docs/plans/PLAN-repo-indexing.md` (monorepo).

<!-- index:meta
repo: service-portal-frontend
tipo: spa-react (Server Driven UI, fala só com o BFF)
fonte-de-verdade: package.json, vite.config.ts, src/api/bff.ts, src/types/index.ts
atualizado-em: 2026-11-07
-->

## Resumo

SPA que renderiza o que o BFF descreve: o menu vem de GET /bff/menu e o schema de cada tela vem de GET /bff/features/{id}/ui-schema. Não tem regra de negócio nem roteador: a tela ativa é estado do `App`. Fala somente com o BFF, nunca com Manager ou Orchestrator.

<!-- gen:size -->Tamanho: 24 arquivos .ts e .tsx em `src`, dos quais 6 de teste (90 casos).<!-- /gen:size -->

Stack: React 18.3, TypeScript 5.6, Vite 5, Vitest 2 com jsdom. CSS puro, sem biblioteca de UI nem gerenciador de estado, `fetch` nativo. Porta dev 5173, porta no Docker 80 (nginx).

## Telas

A navegação não usa URL, exceto `/auth/callback`.

| Tela | Auth | Arquivo |
|---|---|---|
| Login (usuário e senha) | público | `src/components/Login/LoginPage.tsx` |
| Callback OIDC | público | `src/auth/AuthProvider.tsx` |
| Menu lateral | token | `src/components/Sidebar/Sidebar.tsx`, montado em `src/App.tsx` |
| flow-manager | token | `src/components/features/FlowManager/FlowManager.tsx` (listar, criar, ver, executar v1 e v2) |
| integration-manager | escrita ADMIN | `src/components/features/IntegrationManager/IntegrationManager.tsx` |
| contract-manager | escrita ADMIN, WORKFLOWS | `src/components/features/ContractManager/ContractManager.tsx` |
| validation-manager | escrita ADMIN, RULES | `src/components/features/ValidationManager/ValidationManager.tsx` |

Os três últimos só configuram `ResourceManager` (listar, criar, detalhe, versões, editar). O `type` do schema escolhe a tela em `componentMap`, em `src/components/ComponentRenderer/ComponentRenderer.tsx`. A permissão real é do BFF; o front só esconde botões com `canWrite`.

## Chamadas ao BFF

Cliente único: `src/api/bff.ts` (base /bff). Exceção: `src/auth/oauth.ts` chama /bff/auth/config e /bff/auth/login, além do IdP.

| Método | Endpoint |
|---|---|
| `bff.menu`, `bff.uiSchema` | GET /menu, GET /features/{id}/ui-schema |
| `bff.flows.list`, `get`, `getYaml` | GET /flows[?page&size&sort&status], /flows/{id}/versions/{v}[/yaml] |
| `bff.flows.create`, `update`, `delete` | POST /flows, PUT e DELETE /flows/{id}/versions/{v} (corpo YAML) |
| `bff.flows.getExample` | GET /flows/{id}/versions/{v}/examples |
| `bff.flows.execute`, `executeV2` | POST /flows/{id}/versions/{v}/executions e /executions/v2 |
| `bff.integrations`, `contracts`, `validations` | `resourceApi`: list, get, listVersions, create, update, delete em /{recurso}[/{id}/versions/{n}] |

## Fluxo

1. `src/main.tsx` monta `AuthProvider` e `App`. O provider busca /bff/auth/config, faz discovery OIDC e, se a URL é /auth/callback, troca o code por tokens (PKCE S256).
2. Login normal: `LoginPage` chama `loginWithCredentials`, que posta em /bff/auth/login. `startLogin` (redirect PKCE) existe, mas nenhuma tela o chama.
3. Tokens ficam em `sessionStorage` (`src/auth/storage.ts`). `groups` e `displayName` saem do JWT por `src/auth/jwt.ts` (decodifica base64url e UTF-8, para nomes com acento).
4. `App` só carrega o menu quando `status` é `authenticated`. Ao escolher um item, busca o ui-schema e entrega a `ComponentRenderer`. Erro 403 vira mensagem de acesso negado.
5. `request`, em `bff.ts`, injeta o Bearer. Em 401 tenta `refreshTokens` uma vez (single-flight: 401s concorrentes compartilham um refresh só, `refreshOnce`); se falhar, chama `onUnauthorized` e a sessão cai.
6. Edição: `FlowManager` envia o YAML inteiro em PUT. `ResourceManager` edita o JSON do item e chama `api.update(id, version, body)`.

## Mapa

| Caminho | Papel |
|---|---|
| `src/main.tsx`, `src/App.tsx` | Entrada, gate de auth, menu, schema ativo, usuário e grupo |
| `src/api/bff.ts` | Cliente HTTP, `resourceApi`, setters `setOnUnauthorized` e `setAuthConfig` |
| `src/auth/*` | `AuthProvider` (`useAuth`), `oauth`, `pkce`, `storage`, `jwt` |
| `src/components/features/ResourceManager/*` | UI genérica de recurso versionado, recebe `ResourceConfig` |
| `src/components/features/*` | Uma tela por tipo de schema |
| `src/components/*` | `ComponentRenderer` (despacho por type), `Sidebar`, `Login` |
| `src/types/index.ts` | Tipos do contrato com o BFF |
| `src/styles/*`, `src/*.css` | Estilo compartilhado das telas de gestão, global e da casca |
| `src/test/setup.ts` | Setup do Vitest; testes ficam em `__tests__` ao lado do código |

Fora de `src`: `vite.config.ts` (proxy, testes, cobertura), `nginx/*`, `docker-entrypoint.sh`, `Dockerfile`.

## Quero mudar... onde

| Mudança | Onde |
|---|---|
| Nova tela | O BFF devolve menu e ui-schema. Crie o componente em `src/components/features/` e registre o type em `componentMap` (`ComponentRenderer.tsx`) |
| Novo recurso versionado | Componente fino como `ContractManager.tsx` (`idField`, `template`, `canWrite`), `resourceApi<T>` em `src/api/bff.ts`, tipo em `src/types/index.ts` |
| Nova chamada ao BFF | Método em `bff` (`src/api/bff.ts`) e teste em `src/api/__tests__/bff.test.ts` |
| Quem escreve numa tela | `canWrite` no componente do recurso (o enforce real é do BFF) |
| Validação de formulário | `parsePayload` em `FlowManager.tsx`; `JSON.parse` em `handleCreate` e `handleUpdate` de `ResourceManager.tsx`. Não há biblioteca de formulário |
| Template inicial de criação | `TEMPLATE` no `*Manager.tsx` do recurso; `FLOW_TEMPLATE` em `FlowManager.tsx` |
| Layout e estilo | `src/App.tsx` e `src/*.css` (casca), `src/styles/*` (gestão) |
| Rótulo de grupo | `GROUP_LABELS` em `src/App.tsx` |
| Login, refresh, logout | `loginWithPassword`, `refreshTokens`, `logout` em `src/auth/oauth.ts`; estado em `src/auth/AuthProvider.tsx` |
| URL do BFF ou porta | Dev: `server.proxy` em `vite.config.ts`. Docker: `BFF_URL` e `NGINX_PORT` |
| Gate de cobertura | `test.coverage` em `vite.config.ts` |

## Config

- Sem variáveis VITE_: o código usa o caminho relativo /bff.
- Dev: proxy de /bff para http://localhost:8081 em `vite.config.ts`.
- Docker: `BFF_URL` (padrão http://localhost:8081) e `NGINX_PORT` (padrão 80), aplicadas por `docker-entrypoint.sh` no template de `nginx/*`.
- Dev com WireMock: `docker-compose-frontend-dev.yml`. Stack completa: `../docker-compose-service-portal.yml`.

## Comandos

```bash
npm install && npm run dev   # http://localhost:5173, exige o BFF em :8081
npm run build                # tsc -b && vite build, saída em dist/
npm test                     # vitest run; npm run test:watch para watch
npm run coverage             # relatório em coverage/index.html
```

Não há script de lint.

CI (`ci.yml`): `build` e `docker-build` (buildx sem push, cache gha, smoke `curl /`) em paralelo; depois `test` (coverage); `agents-index` roda desde o início; `open-pr` precisa de `test` e `agents-index`.

## Armadilhas

- Sem biblioteca de UI, sem estado global, sem `fetch` fora de `bff.ts` (exceção: `oauth.ts`). Não atualizar React 18 nem TypeScript 5.
- Dependência nova só com justificativa e versão exata (o `package.json` usa `^`: não propague). Em pipeline use `npm ci`.
- O gate de 95% cobre só `src/auth/**/*.ts` e `src/api/**/*.ts`. Mudou `auth` ou `api`: mude o teste.
- Tokens ficam em `sessionStorage` de propósito. Não use `localStorage`.
- `bff.ts` e `AuthProvider` se ligam por setters de módulo. Sem o provider montado, refresh e logout em 401 não funcionam.
- Refresh em 401 é single-flight (`refreshInFlight` em `bff.ts`): não chame `refreshTokens` direto de outro lugar, o refresh_token pode ser rotacionado pelo IdP.
- `returnTo` do callback passa por `sanitizeReturnTo` (`storage.ts`): só caminho relativo começando com `/`, senão `/`.
- `request` só devolve texto se o header `Accept` contém yaml; senão faz `res.json()`.
- Fluxos enviam YAML e têm `version` string; os recursos modulares enviam JSON e têm `version` numérica.
- Nunca commite `.env` com segredo nem `unsafe-inline` ou `unsafe-eval` no `index.html`.
