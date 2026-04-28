# Public API v1 — Test Plan curl (M2 Core)

> Data: 26 Aprile 2026  
> Scope: test manuali endpoint M2 via `curl`

---

## 1) Prerequisiti

- App avviata in locale o raggiungibile su un host (`BASE_URL`).
- DB disponibile (consigliato) e migrazione M1 applicata manualmente.
- Facoltativo: `jq` installato per formattare JSON.

Se lavori in locale:

```zsh
cd /Users/xarm0rer/WORKSPACEs/synapse-sap-explorer
pnpm dev
```

---

## 2) Setup variabili shell

```zsh
export BASE_URL="http://localhost:3000"
# Facoltativo: API key
export API_KEY=""
```

Header helper (opzionale):

```zsh
if [ -n "$API_KEY" ]; then
  export AUTH_HEADER="-H x-api-key:$API_KEY"
else
  export AUTH_HEADER=""
fi
```

---

## 3) Smoke test ordine consigliato

## 3.1 Status

```zsh
curl -s $AUTH_HEADER "$BASE_URL/api/v1/status" | jq
```

Atteso:
- HTTP 200
- `data.status` in `ok|degraded|down`
- `meta.requestId` presente

## 3.2 Agents list

```zsh
curl -s $AUTH_HEADER "$BASE_URL/api/v1/agents?limit=5" | jq
```

Atteso:
- HTTP 200
- `data` array
- `meta.total` numerico

## 3.3 Tools list

```zsh
curl -s $AUTH_HEADER "$BASE_URL/api/v1/tools" | jq
```

Atteso:
- HTTP 200
- `data.tools` array

## 3.4 Escrows list

```zsh
curl -s $AUTH_HEADER "$BASE_URL/api/v1/escrows?limit=10" | jq
```

Atteso:
- HTTP 200
- `data` array

## 3.5 Transactions list

```zsh
curl -s $AUTH_HEADER "$BASE_URL/api/v1/transactions?page=1&perPage=10" | jq
```

Atteso:
- HTTP 200
- `data` array
- `meta.page`, `meta.limit`, `meta.hasMore`

## 3.6 Network metrics

```zsh
curl -s $AUTH_HEADER "$BASE_URL/api/v1/network/metrics" | jq
```

Atteso:
- HTTP 200
- `data` object con metriche aggregate

## 3.7 Network graph

```zsh
curl -s $AUTH_HEADER "$BASE_URL/api/v1/network/graph" | jq
```

Atteso:
- HTTP 200
- `data.nodes` e `data.links`

## 3.8 Network snapshots

```zsh
curl -s $AUTH_HEADER "$BASE_URL/api/v1/network/snapshots?days=30" | jq
```

Atteso:
- HTTP 200
- `data` array snapshot

## 3.9 Search

```zsh
curl -s $AUTH_HEADER "$BASE_URL/api/v1/search?q=agent&limit=10" | jq
```

Atteso:
- HTTP 200
- `data` array risultati

---

## 4) Test endpoint dettaglio (con parametri reali)

> Prima estrai valori reali da list endpoint (wallet, pda, signature).

### 4.1 Prendi wallet agent

```zsh
export AGENT_WALLET=$(curl -s $AUTH_HEADER "$BASE_URL/api/v1/agents?limit=1" | jq -r '.data[0].identity.wallet')
echo "$AGENT_WALLET"
```

### 4.2 Prendi escrow pda

```zsh
export ESCROW_PDA=$(curl -s $AUTH_HEADER "$BASE_URL/api/v1/escrows?limit=1" | jq -r '.data[0].pda')
echo "$ESCROW_PDA"
```

### 4.3 Prendi tx signature

```zsh
export TX_SIG=$(curl -s $AUTH_HEADER "$BASE_URL/api/v1/transactions?page=1&perPage=1" | jq -r '.data[0].signature')
echo "$TX_SIG"
```

### 4.4 Agent detail

```zsh
curl -s $AUTH_HEADER "$BASE_URL/api/v1/agents/$AGENT_WALLET" | jq
```

### 4.5 Escrow detail

```zsh
curl -s $AUTH_HEADER "$BASE_URL/api/v1/escrows/$ESCROW_PDA" | jq
```

### 4.6 Tx detail

```zsh
curl -s $AUTH_HEADER "$BASE_URL/api/v1/tx/$TX_SIG" | jq
```

### 4.7 Address lookup

```zsh
curl -s $AUTH_HEADER "$BASE_URL/api/v1/address/$AGENT_WALLET" | jq
```

---

## 5) Test negativi minimi

## 5.1 Parametri invalidi

```zsh
curl -s $AUTH_HEADER "$BASE_URL/api/v1/agents/not-a-solana-key" | jq
curl -s $AUTH_HEADER "$BASE_URL/api/v1/escrows/not-a-solana-key" | jq
curl -s $AUTH_HEADER "$BASE_URL/api/v1/network/snapshots?days=-1" | jq
```

Atteso:
- HTTP 400 oppure errore envelope con `error.code=INVALID_PARAM`

## 5.2 Not found

```zsh
curl -s $AUTH_HEADER "$BASE_URL/api/v1/tx/1111111111111111111111111111111111111111111111111111111111111111" | jq
```

Atteso:
- HTTP 404
- `error.code=NOT_FOUND`

## 5.3 Rate limit (solo se configurato aggressivo)

```zsh
for i in {1..80}; do curl -s $AUTH_HEADER "$BASE_URL/api/v1/status" > /dev/null; done
curl -i -s $AUTH_HEADER "$BASE_URL/api/v1/status"
```

Atteso (a soglia superata):
- HTTP 429
- body con `error.code=RATE_LIMITED`
- header `Retry-After`

---

## 6) Check headers standard

```zsh
curl -i -s $AUTH_HEADER "$BASE_URL/api/v1/status" | sed -n '1,30p'
```

Atteso:
- `X-Request-Id`
- `X-Data-Source`
- `X-Data-Age`
- `Cache-Control`
- se rate-limit applicato: `X-RateLimit-Limit`, `X-RateLimit-Remaining`, `X-RateLimit-Reset`

---

## 7) Checklist finale M2

- [ ] `status` ok
- [ ] list endpoint ok: agents/tools/escrows/transactions
- [ ] detail endpoint ok: agent/escrow/tx/address
- [ ] network endpoint ok: metrics/graph/snapshots
- [ ] search ok
- [ ] test negativi (invalid/not-found) ok
- [ ] headers standard presenti
- [ ] nessuna modifica DB automatica durante i test

