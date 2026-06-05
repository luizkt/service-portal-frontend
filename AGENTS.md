# AGENTS.md — service-portal-frontend

Guia de contexto para agentes de IA trabalhando neste componente.

---

## Stack

| Item | Versão |
|---|---|
| React | 18.3 |
| TypeScript | 5.6 |
| Bundler | Vite 5 |
| Testes | Vitest 2 + jsdom + @testing-library/react |
| Porta dev | 5173 |
| Porta prod (Docker) | 80 |

---

## Responsabilidade

O frontend é uma **SPA React com Server Driven UI**: o BFF controla quais features existem (menu) e qual schema de UI cada feature usa. O frontend não tem regras de negócio — só renderiza o que o BFF descreve.

Regras fixas:
- Toda comunicação HTTP passa pelo módulo `src/api/bff.ts` — nunca `fetch` direto em componentes
- Nenhuma biblioteca de UI externa (sem Material UI, Ant Design, Chakra, etc.) — apenas CSS puro
- Sem gerenciador de estado externo — `useState` e `useEffect` nativos do React

---

## Autenticação — OAuth2/PKCE (Authorization Code + S256)

O fluxo é implementado em `src/auth/` sem bibliotecas externas:

1. `AuthProvider` carrega `GET /bff/auth/config` (issuer, client_id, scopes)
2. `startLogin` gera code_verifier/state via Web Crypto API, persiste em `sessionStorage` e redireciona para `/authorize`
3. No callback (`/auth/callback`), `exchangeCodeForTokens` valida o state (anti-CSRF), troca o code pelo token via `POST /token`
4. Tokens ficam em `sessionStorage` (somem ao fechar a aba, sobrevivem a reload)
5. `bff.ts` injeta `Authorization: Bearer <token>` automaticamente em todas as requisições
6. Em resposta 401 do BFF, `AuthProvider` derruba a sessão e volta para o estado `unauthenticated`

---

## Estrutura de arquivos

```
src/
├── api/
│   └── bff.ts                  # único cliente HTTP — todos os paths do BFF centralizados aqui
├── auth/
│   ├── AuthProvider.tsx        # Context React: status (loading|unauthenticated|authenticated|error)
│   ├── oauth.ts                # fetchAuthConfig, startLogin, exchangeCodeForTokens, logout, isTokenValid
│   ├── pkce.ts                 # Web Crypto API: generateCodeVerifier, generateCodeChallenge, generateRandomString
│   └── storage.ts              # sessionStorage: saveTokens/loadTokens/clearTokens, savePkceState/loadPkceState
├── components/
│   ├── ComponentRenderer/
│   │   └── ComponentRenderer.tsx   # mapa de type → componente React; renderiza a feature correta
│   ├── features/
│   │   └── FlowManager/
│   │       └── FlowManager.tsx     # CRUD de workflows YAML + executor de fluxos com payload JSON
│   └── Sidebar/
│       └── Sidebar.tsx             # sidebar populada via GET /bff/menu
├── types/
│   └── index.ts                # MenuItem, UiSchema, FlowDefinition, FlowsPage, OrchestrationResponse
├── App.tsx                     # gate de autenticação + botão "Sair" na sidebar
└── main.tsx                    # entrada: <AuthProvider><App /></AuthProvider>
```

---

## Como rodar localmente

### Pré-requisitos

- Node.js (versão compatível com Vite 5)
- BFF rodando em `localhost:8081` (ou via Docker)

### Dev server

```bash
cd service-portal-frontend
npm install
npm run dev       # http://localhost:5173
```

O Vite faz proxy de `/bff/*` para `http://localhost:8081` — sem CORS em dev.

### Build de produção

```bash
npm run build     # saída em dist/
npm run preview   # serve o build localmente
```

### Docker

```bash
docker build -t service-portal-frontend:local .
# ou via stack completa:
docker compose -f docker-compose-service-portal.yml up -d
```

---

## Como testar

```bash
cd service-portal-frontend

# Testes (modo CI — executa uma vez)
npm test

# Testes em modo watch
npm run test:watch

# Testes + relatório de cobertura
npm run coverage
# Relatório em: coverage/index.html
```

### Gate de cobertura

Gate ≥ 95% em lines/functions/branches/statements, aplicado apenas sobre:
- `src/auth/**/*.ts`
- `src/api/**/*.ts`

Cobertura atual: **100%** (44 testes).

Componentes React (`ComponentRenderer`, `FlowManager`, `Sidebar`, `App`) não estão no gate — são testados manualmente via browser.

---

## Módulo `bff.ts` — API pública

```typescript
bff.menu()                                    // GET /bff/menu → MenuItem[]
bff.uiSchema(featureId)                       // GET /bff/features/{id}/ui-schema → UiSchema
bff.flows.list(params?)                       // GET /bff/flows[?page&size&sort&status] → FlowsPage | FlowDefinition[]
bff.flows.get(flowId, version)                // GET /bff/flows/{id}/versions/{v} → FlowDefinition
bff.flows.getYaml(flowId, version)            // GET /bff/flows/{id}/versions/{v}/yaml → string
bff.flows.create(yaml)                        // POST /bff/flows (text/plain) → FlowDefinition
bff.flows.update(flowId, version, yaml)       // PUT /bff/flows/{id}/versions/{v} (text/plain) → FlowDefinition
bff.flows.delete(flowId, version)             // DELETE /bff/flows/{id}/versions/{v} → void
bff.flows.execute(flowId, version, payload)   // POST /bff/flows/{id}/versions/{v}/executions → OrchestrationResponse
```

Todos os métodos lançam `Error` com mensagem `"<status> <statusText>: <body>"` em respostas não-OK.

---

## Como adicionar uma nova feature (Server Driven UI)

1. O BFF precisa retornar o novo item em `GET /bff/menu` e em `GET /bff/features/{novoId}/ui-schema`
2. Criar o componente em `src/components/features/NovaFeature/NovaFeature.tsx`
3. Registrar no mapa de `ComponentRenderer.tsx`:
   ```typescript
   case 'nova-feature': return <NovaFeature schema={schema} />
   ```
4. O `type` no schema retornado pelo BFF deve bater com o `case` acima

---

## Decisões de design

**Sem bibliotecas de UI.** Apenas CSS puro — não instalar Material UI, Ant Design, Tailwind, etc.

**Sem gerenciador de estado global.** `useState`/`useEffect` são suficientes para a complexidade atual. Não adicionar Redux, Zustand, Jotai, etc. sem necessidade clara.

**`fetch` nativo, centralizado em `bff.ts`.** O interceptor de 401 e a injeção do Bearer token ficam em um único lugar. Componentes não chamam `fetch` diretamente.

**Tokens em `sessionStorage`.** Escolha deliberada: tokens somem ao fechar a aba (menor janela de exposição), mas sobrevivem a reload. `localStorage` foi descartado por manter tokens indefinidamente.

**Proxy Vite em dev.** `vite.config.ts` redireciona `/bff/*` para `localhost:8081`. Em produção (Docker), Nginx faz o mesmo proxy. Não há hardcoded de URL do BFF no código.

---

## Segurança

### Dependências

- **Não instale novos pacotes** sem questionar primeiro se a funcionalidade pode ser implementada nativamente
- Prefira zero dependências para utilitários simples — três linhas de código são melhores que um pacote inteiro
- Ao instalar qualquer pacote novo, siga o checklist:
  - Verificar data da última atualização e downloads semanais (preferir > 100k/semana) no [npmjs.com](https://npmjs.com)
  - Confirmar que o nome do pacote é exatamente o esperado (evitar typosquatting, ex: `lodahs` vs `lodash`)
  - Verificar comportamento suspeito em [socket.dev](https://socket.dev)
  - Rodar `npm audit` após instalar
- Fixe versões de forma **exata** no `package.json` — sem `^` ou `~` em dependências de produção
- Nunca remover ou ignorar o `package-lock.json` — ele garante reprodutibilidade entre ambientes

### Variáveis de ambiente

- **Nunca** criar ou commitar arquivos `.env` com segredos reais
- Usar `.env.example` para documentar variáveis necessárias (sem valores reais)
- Confirmar que `.env`, `.env.local`, `.env.production` e `.env*.local` estão no `.gitignore`

### Content Security Policy

- Ao modificar o `index.html`, não adicionar `script-src 'unsafe-inline'` ou `script-src 'unsafe-eval'` sem justificativa explícita
- Bibliotecas carregadas via CDN devem usar o atributo `integrity` (SRI) — gerar o hash em [srihash.org](https://www.srihash.org/)

### Comandos em CI/CD

- Usar `npm ci` em vez de `npm install` em pipelines — garante instalação exata do lockfile
- Rodar `npm audit --audit-level=high` como gate obrigatório antes do build

---

## Restrições

- React 18 + TypeScript 5 — não atualizar versões
- Sem bibliotecas de UI externas
- Sem gerenciador de estado externo
- Toda comunicação HTTP via `src/api/bff.ts` — sem `fetch` direto em componentes
- Frontend fala **somente** com o BFF — nunca com orquestrador ou manager diretamente
