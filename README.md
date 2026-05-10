# Service Portal Frontend

Frontend do Service Portal, baseado em React 18 + TypeScript + Vite 5.

## Visão Geral

Aplicação SPA construída sobre o padrão **Server Driven UI**: o frontend não tem regras de negócio nem rotas hardcoded. O `service-portal-bff` informa quais funcionalidades existem (`/bff/menu`) e qual componente cada uma usa (`/bff/ui/{featureId}`); o frontend só registra os componentes disponíveis e renderiza dinamicamente.

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
| Servidor de produção | nginx (alpine) |

Sem libs de UI/state externas — `fetch` nativo e `useState/useEffect`.

---

## Estrutura do Projeto

```
src/
├── main.tsx
├── App.tsx                                    # Layout: sidebar + área principal
├── App.css / index.css
├── api/
│   └── bff.ts                                 # Cliente HTTP do BFF (todas as chamadas ficam aqui)
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
```

O dev server sobe em `http://localhost:5173`. O BFF precisa estar rodando em `http://localhost:8081`.

---

## Server Driven UI

### Fluxo de renderização

```
1. App.tsx                → bff.menu()              → /bff/menu
2. Usuário clica em item  → bff.uiSchema(item.id)   → /bff/ui/{featureId}
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
bff.menu()                                   // GET    /bff/menu
bff.uiSchema(featureId)                      // GET    /bff/ui/{featureId}

bff.flows.list()                             // GET    /bff/flows
bff.flows.get(flowId)                        // GET    /bff/flows/{flowId}
bff.flows.create(yaml)                       // POST   /bff/flows           (text/plain)
bff.flows.update(flowId, yaml)               // PUT    /bff/flows/{flowId}  (text/plain)
bff.flows.delete(flowId)                     // DELETE /bff/flows/{flowId}
bff.flows.execute(version, flowId, payload)  // POST   /bff/orchestrate/{version}/{flowId}
```

A base é sempre `/bff` — em dev resolve via proxy do Vite, em produção via proxy do nginx.

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
  mongoId: string
  id: string
  descricao: string
  versao: string
  ativo: boolean
  criadoEm: string
  atualizadoEm: string
}

interface OrchestrationResponse {
  executionId: string
  flowId: string
  status: string
  resultado: Record<string, unknown>
  errorMessage?: string
  iniciadoEm: string
  finalizadoEm: string
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

## Autenticação

Atualmente **não há fluxo de login implementado** — o BFF aceita requisições autenticadas via JWT do Authentik, mas o frontend ainda não negocia esse token. Próximo passo natural: integrar o fluxo OAuth2/PKCE com Authentik e injetar o `Authorization: Bearer` em `src/api/bff.ts`.
