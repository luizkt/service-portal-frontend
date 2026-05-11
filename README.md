# Service Portal Frontend

Frontend do Service Portal, baseado em React 18 + TypeScript + Vite 5.

## Visão Geral

Aplicação SPA construída sobre o padrão **Server Driven UI**: o frontend não tem regras de negócio nem rotas hardcoded. O `service-portal-bff` informa quais funcionalidades existem (`/bff/menu`) e qual componente cada uma usa (`/bff/features/{featureId}/ui-schema`); o frontend só registra os componentes disponíveis e renderiza dinamicamente.

Premissas:

- **Sem regras de negócio**: toda lógica vive no BFF/orquestrador
- **Plug-and-play**: novas features aparecem assim que o BFF expõe um `type` que o `ComponentRenderer` reconhece
- **Sem cliente direto ao orquestrador**: o BFF é a única origem de dados

---

## Stack

| Componente | Versão |
|---|---|
| React | 18.3 |
| TypeScript | 5.6 |
| Vite | 5.4 |
| Vitest + @testing-library/react | 2.1 / 16.1 |
| Servidor de produção | nginx (alpine) |

Sem libs de UI/state externas — `fetch` nativo e `useState/useEffect`. Auth OAuth2/PKCE implementada à mão sobre Web Crypto API.

---

## Estrutura do Projeto

```
src/
├── main.tsx                                   # Monta <AuthProvider><App /></AuthProvider>
├── App.tsx                                    # Gate de login + sidebar + botão "Sair"
├── App.css / index.css
├── api/
│   ├── bff.ts                                 # Cliente HTTP do BFF — injeta Authorization: Bearer
│   └── __tests__/bff.test.ts
├── auth/
│   ├── pkce.ts                                # Web Crypto: code_verifier, S256 challenge, state
│   ├── storage.ts                             # sessionStorage (sp.auth.tokens, sp.auth.pkce)
│   ├── oauth.ts                               # fetchAuthConfig, startLogin, exchangeCodeForTokens, logout
│   ├── AuthProvider.tsx                       # Context React com status loading|auth|unauth|error
│   └── __tests__/                             # pkce / storage / oauth
├── test/
│   └── setup.ts                               # @testing-library/jest-dom
├── types/
│   └── index.ts                               # MenuItem, UiSchema, FlowDefinition, OrchestrationResponse
└── components/
    ├── Sidebar/
    │   ├── Sidebar.tsx                        # Renderiza itens vindos de /bff/menu
    │   └── Sidebar.css
    ├── ComponentRenderer/
    │   ├── ComponentRenderer.tsx              # Server Driven UI: schema.type → componente
    │   └── ComponentRenderer.css
    └── features/
        └── FlowManager/
            ├── FlowManager.tsx                # Feature type "flow-manager"
            └── FlowManager.css
nginx/
└── default.conf.template                      # Proxy /bff/ + SPA fallback
```

---

## Configuração

### Desenvolvimento (`vite.config.ts`)

O dev server escuta em `5173` e faz proxy de `/bff` para `http://localhost:8081` (BFF rodando local). Não é necessário CORS em dev.

### Produção (nginx)

O `default.conf.template` é gerado a partir de variáveis de ambiente no `entrypoint`:

| Variável | Descrição | Default |
|---|---|---|
| `NGINX_PORT` | Porta exposta pelo container | `80` |
| `BFF_URL` | URL base do BFF (proxy de `/bff/`) | `http://localhost:8081` |

Tudo que casar com `/bff/` é repassado ao BFF; o restante cai no fallback SPA (`try_files ... /index.html`).

---

## Como Executar

```bash
# 1. Instalar dependências
npm install

# 2. Dev server (proxy automático para localhost:8081)
npm run dev

# 3. Build de produção (gera dist/)
npm run build

# 4. Preview do build de produção
npm run preview

# 5. Testes unitários
npm test                     # vitest run
npm run test:watch           # modo watch
npm run coverage             # gate de 95% via vite.config.ts
```

O dev server sobe em `http://localhost:5173`. O BFF precisa estar rodando em `http://localhost:8081`.

---

## Server Driven UI

### Fluxo de renderização

```
1. App.tsx                → bff.menu()              → /bff/menu
2. Usuário clica em item  → bff.uiSchema(item.id)   → /bff/features/{featureId}/ui-schema
3. ComponentRenderer      → componentMap[schema.type]  → renderiza o componente
```

### `componentMap` — registro de features

Em [src/components/ComponentRenderer/ComponentRenderer.tsx](src/components/ComponentRenderer/ComponentRenderer.tsx):

```ts
const componentMap: Record<string, React.ComponentType<{ schema: UiSchema }>> = {
  'flow-manager': FlowManager,
}
```

Para adicionar uma nova feature:

1. **No BFF**: adicionar item em `BffMenuController.menu()` e o respectivo case em `uiSchema(...)` retornando um `type` novo
2. **No frontend**: criar o componente em `src/components/features/<NomeDaFeature>/` e registrá-lo no `componentMap` com a chave igual ao `type` do schema
3. **Pronto** — o item aparece automaticamente na sidebar; nenhuma rota ou roteador é necessário

Se o `type` não estiver mapeado, o `ComponentRenderer` mostra uma mensagem de "componente não encontrado" — útil durante o desenvolvimento incremental.

---

## Cliente HTTP do BFF

Todas as chamadas ficam concentradas em [src/api/bff.ts](src/api/bff.ts):

```ts
bff.menu()                                                // GET    /bff/menu
bff.uiSchema(featureId)                                   // GET    /bff/features/{featureId}/ui-schema

bff.flows.list({ page, size, sort, status })              // GET    /bff/flows[?status=active&page=...]
bff.flows.get(flowId, version)                            // GET    /bff/flows/{flowId}/versions/{version}
bff.flows.getYaml(flowId, version)                        // GET    /bff/flows/{flowId}/versions/{version}/yaml
bff.flows.create(yaml)                                    // POST   /bff/flows           (text/plain)
bff.flows.update(flowId, version, yaml)                   // PUT    /bff/flows/{flowId}/versions/{version}
bff.flows.delete(flowId, version)                         // DELETE /bff/flows/{flowId}/versions/{version}
bff.flows.execute(flowId, version, payload)               // POST   /bff/flows/{flowId}/versions/{version}/executions
```

A base é sempre `/bff` — em dev resolve via proxy do Vite, em produção via proxy do nginx.

O cliente lê automaticamente `sp.auth.tokens` do `sessionStorage` e injeta `Authorization: Bearer <access_token>` em todas as requisições. Em respostas **401**, dispara o handler registrado por `setOnUnauthorized(...)` (o `AuthProvider` usa isso para limpar tokens e voltar à tela de login) — depois ainda lança o erro normalmente.

---

## Componentes

### `Sidebar`

Recebe `items: MenuItem[]` (do BFF), `activeId` e `onSelect`. Não decide nada por conta própria — só dispara o callback quando um item é clicado.

### `ComponentRenderer`

Recebe `schema: UiSchema | null` e:

- Se `schema === null` → tela de boas-vindas
- Se `schema.type` está em `componentMap` → renderiza o componente correspondente
- Caso contrário → mensagem de "componente não encontrado"

### `FlowManager` (feature `type: "flow-manager"`)

CRUD completo dos fluxos do orquestrador, com 4 visualizações:

| View | Função |
|---|---|
| `list` | Tabela com fluxos ativos, ações inline (Executar / Desativar) |
| `create` | Editor textarea de YAML — usado tanto para criar quanto editar |
| `detail` | Card com metadados do fluxo + ações (Executar / Editar / Desativar) |
| `execute` | Form com `version` (default `v1`) + payload JSON; mostra `OrchestrationResponse` formatado |

Inclui um `FLOW_TEMPLATE` YAML pré-preenchido para acelerar a criação de fluxos novos.

---

## Tipos principais

```ts
interface MenuItem {
  id: string
  label: string
  icon: string
  uiSchemaUrl: string
}

interface UiSchema {
  featureId: string
  type: string                // discriminador para o ComponentRenderer
  title: string
}

interface FlowDefinition {
  flowId: string
  version: string
  description: string
  active: boolean
  createdAt: string
  updatedAt: string
}

interface FlowsPage {
  content: FlowDefinition[]
  totalElements: number
  totalPages: number
  size: number
  number: number
  first: boolean
  last: boolean
}

interface OrchestrationResponse {
  executionId: string
  flowId: string
  status: string
  result: Record<string, unknown>
  errorMessage?: string
  startedAt: string
  finishedAt: string
}
```

---

## Docker

```bash
docker build -t service-portal-frontend .
docker run --rm -p 80:80 \
  -e BFF_URL=http://service-portal-bff:8081 \
  service-portal-frontend
```

O `Dockerfile` faz build em duas etapas (Node 22 + nginx alpine). O `docker-entrypoint.sh` substitui `${BFF_URL}` e `${NGINX_PORT}` no template do nginx antes de iniciar o servidor.

---

## Autenticação — OAuth2 Authorization Code + PKCE (S256)

A SPA é um **client público**: faz o fluxo PKCE direto contra o Authentik, recebe um access token e o envia ao BFF (que valida via JWKS). O BFF nunca emite tokens nem mantém sessão.

### Módulos em [src/auth/](src/auth/)

| Arquivo | Responsabilidade |
|---|---|
| [pkce.ts](src/auth/pkce.ts) | `generateCodeVerifier` (43–128 chars unreserved), `generateCodeChallenge` (SHA-256 + base64url) e `generateRandomString` para `state`/`nonce`. Implementação sobre `crypto.subtle` e `crypto.getRandomValues` — sem dependências |
| [storage.ts](src/auth/storage.ts) | Persistência em `sessionStorage` — chaves `sp.auth.tokens` (access/id/refresh + `expiresAt`) e `sp.auth.pkce` (`codeVerifier`, `state`, `returnTo`) |
| [oauth.ts](src/auth/oauth.ts) | `fetchAuthConfig()`, `startLogin()`, `exchangeCodeForTokens()`, `logout()` e `isTokenValid()` (skew configurável) |
| [AuthProvider.tsx](src/auth/AuthProvider.tsx) | Context React com `status: 'loading' \| 'unauthenticated' \| 'authenticated' \| 'error'`. Detecta `/auth/callback`, troca `code` por token, registra handler de 401 no cliente do BFF |

### Fluxo

```
1. AuthProvider monta → GET /bff/auth/config         (issuer, client_id, scopes)
2. Usuário clica "Entrar" → startLogin()
   ├─ gera code_verifier (64 chars) e state
   ├─ persiste em sessionStorage
   └─ window.location = ${issuer}authorize/?response_type=code&code_challenge=…&code_challenge_method=S256&state=…
3. Authentik autentica → redirect /auth/callback?code=…&state=…
4. AuthProvider detecta /auth/callback:
   ├─ valida state contra o persistido (anti-CSRF)
   ├─ POST ${issuer}token/  (grant_type=authorization_code + code_verifier + client_id)
   ├─ guarda { accessToken, idToken, refreshToken, expiresAt } em sessionStorage
   └─ history.replaceState('/')  → cai no app autenticado
5. bff.ts injeta Authorization: Bearer <access_token> em toda requisição
6. Logout → clearTokens + window.location = ${issuer}end-session/?id_token_hint=…&post_logout_redirect_uri=…
```

### Configuração no Authentik

Cadastre uma **OAuth2/OIDC Provider** + uma **Application** com slug `service-portal`. O provider deve ser **public client** (sem secret), com PKCE obrigatório, e ter o redirect URI da SPA registrado (ex: `http://localhost:5173/auth/callback`). Defina `AUTHENTIK_CLIENT_ID` no BFF com o mesmo `client_id` cadastrado.

### Storage / segurança

- Tokens em `sessionStorage` — somem ao fechar a aba; sobrevivem a reload.
- O `refresh_token` é guardado mas o renew automático **ainda não está implementado**: quando o access token expira ou o BFF responde 401, a sessão é invalidada e o usuário precisa relogar.
- `state` e `code_verifier` ficam em `sessionStorage` apenas durante o redirect — limpos no callback.

### Testes

Cobertura atual: **100%** lines/branches/functions/statements em `src/auth/**` e `src/api/**` — gate ≥ 95% configurado em [vite.config.ts](vite.config.ts) (`coverage.thresholds`). 41 testes em 4 arquivos.

```bash
npm run coverage
# Relatório HTML: coverage/index.html
```
