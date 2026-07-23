# auth-service

Serviço de autenticação em **NestJS** com JWT (access + refresh), rotação de refresh token, revogação via Redis, RBAC e rate limiting no login.

Vai além do login básico: trata revogação de sessão, rotação de token e força bruta como parte do problema, não como extra. Abaixo estão as peças implementadas e o porquê de cada uma.

## O que tem implementado

- **JWT access + refresh** — access token curto (15 min) e stateless, validado só pela assinatura, sem ida ao banco. Refresh longo (7 dias) e com estado, controlado via Redis.
- **Rotação de refresh token** — a cada uso, o refresh antigo é invalidado e um novo par é emitido. É o detalhe que separa um auth júnior de um pleno: sem rotação, um token vazado continua válido até expirar sozinho.
- **Revogação via Redis** — cada refresh emitido guarda um `jti` como chave no Redis. Validar é checar se a chave existe; revogar é apagá-la. Logout limpa todas as chaves do usuário, derrubando todas as sessões de uma vez.
- **RBAC** — guard + decorator `@Roles()`, com `/auth/admin` como rota de exemplo restrita a admins.
- **Rate limit no login** — 5 tentativas por minuto por IP na rota de login; o resto da API usa um limite global mais folgado.
- **argon2** para hash de senha, **Swagger** em `/docs`, **docker-compose** com Postgres + Redis para subir o ambiente local com um comando.

## Stack

- **NestJS** + **TypeScript**
- **PostgreSQL** via **TypeORM** — persistência de usuários
- **Redis** (ioredis) — whitelist e revogação de refresh tokens
- **argon2** — hash de senha
- **Passport JWT** — validação do access token
- **@nestjs/throttler** — rate limiting
- **Swagger** — documentação em `/docs`
- **Jest** — testes unitários

## Decisões de arquitetura

**Por que access e refresh separados?**
O access token vive 15 minutos e não tem estado — é validado só pela assinatura, sem consulta ao banco ou ao Redis. Isso mantém as rotas protegidas rápidas, sem I/O extra a cada request. O refresh vive 7 dias e tem estado no Redis, o que permite revogar algo que o access sozinho nunca permitiria.

**Por que rotação de refresh token?**
A cada renovação, o refresh usado é invalidado e um par novo é emitido. Se um refresh vazar e alguém usá-lo antes do dono legítimo, na próxima tentativa do dono o token dele já não é mais válido — o vazamento vira um erro visível em vez de continuar silencioso até o token expirar.

**Por que Redis para os refresh tokens?**
Um JWT puro é stateless por definição: uma vez emitido, não tem como invalidar antes da expiração. Guardando o `jti` de cada refresh como chave no Redis com TTL, ganho a capacidade de revogar (deletar a chave) e de fazer logout global (apagar todas as chaves do usuário) sem precisar transformar o access token em algo stateful.

**Por que argon2 e não bcrypt?**
argon2id é o algoritmo recomendado atualmente pra hash de senha, com resistência melhor a ataques paralelizados em GPU. bcrypt ainda é aceitável, mas a troca aqui é intencional — reflete a recomendação atual, não só hábito.

**Por que rate limit só no login?**
Login é o alvo natural de força bruta: é a rota que aceita credencial errada silenciosamente. Limitei a 5 tentativas por minuto por IP ali; nas demais rotas um limite global mais folgado já é suficiente.

## Como rodar

Requisitos: Node 20+, Docker.

```bash
# 1. Sobe Postgres e Redis
docker compose up -d

# 2. Configura o ambiente
cp .env.example .env

# 3. Instala e roda
yarn install
yarn start:dev
```

A API sobe em `http://localhost:3000` e a documentação Swagger em `http://localhost:3000/docs`.

## Endpoints

| Método | Rota | Descrição | Protegida |
|---|---|---|---|
| POST | `/auth/register` | Cria usuário e retorna par de tokens | — |
| POST | `/auth/login` | Autentica (máx. 5 tentativas/min) | — |
| POST | `/auth/refresh` | Troca refresh por novo par (com rotação) | — |
| POST | `/auth/logout` | Revoga todos os refresh tokens do usuário | access token |
| GET | `/auth/me` | Dados do usuário autenticado | access token |
| GET | `/auth/admin` | Rota de exemplo restrita por RBAC | access token + role admin |

## Exemplo de fluxo

```bash
# Registrar
curl -X POST localhost:3000/auth/register \
  -H 'Content-Type: application/json' \
  -d '{"email":"rafael@exemplo.com","password":"senha-forte-123"}'
# -> { "accessToken": "...", "refreshToken": "..." }

# Acessar rota protegida
curl localhost:3000/auth/me -H 'Authorization: Bearer <accessToken>'

# Renovar (o refresh antigo deixa de valer após esta chamada)
curl -X POST localhost:3000/auth/refresh \
  -H 'Content-Type: application/json' \
  -d '{"refreshToken":"<refreshToken>"}'
```

## Testes

```bash
yarn test
```

Os testes cobrem as regras de autenticação (credencial inválida, senha incorreta, emissão de token em login válido), isolando as dependências com mocks.

## Próximos passos

- Testes de integração com Testcontainers (Postgres e Redis reais em vez de mock)
- Verificação de e-mail e fluxo de recuperação de senha
- Detecção de reuso de refresh token (revogar toda a família de tokens ao detectar replay)

---

Feito por [Rafael Gomes](https://github.com/RafaGms).
