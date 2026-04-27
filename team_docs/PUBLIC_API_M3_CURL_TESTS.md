# Public API v1 — Test Plan curl (M3 Analytics)

> Data: 26 Aprile 2026  
> Scope: test manuali endpoint M3 (`alerts`, `volume`, `volume/daily`, `network/health`)

---

## 1) Prerequisiti

- M2 endpoint gia' verificati (vedi `team_docs/PUBLIC_API_M2_CURL_TESTS.md`).
- App raggiungibile su `BASE_URL`.

```zsh
export BASE_URL="http://localhost:3000"
export API_KEY=""
if [ -n "$API_KEY" ]; then
  export AUTH_HEADER="-H x-api-key:$API_KEY"
else
  export AUTH_HEADER=""
fi
```

---

## 2) Smoke test M3

## 2.1 Escrow alerts

```zsh
curl -s $AUTH_HEADER "$BASE_URL/api/v1/escrows/alerts?hours=48" | jq
```

Atteso:
- HTTP 200
- `data.expiringEscrows` array
- `data.lowBalanceEscrows` array

## 2.2 Volume aggregato

```zsh
curl -s $AUTH_HEADER "$BASE_URL/api/v1/volume" | jq
```

Atteso:
- HTTP 200
- `data.totalSettledLamports`, `data.totalCallsSettled`, `data.topAgentsByRevenue`

## 2.3 Volume daily

```zsh
curl -s $AUTH_HEADER "$BASE_URL/api/v1/volume/daily?bucket=daily&days=30" | jq
```

Atteso:
- HTTP 200
- `data.bucket = "daily"`
- `data.series` array

## 2.4 Volume hourly

```zsh
curl -s $AUTH_HEADER "$BASE_URL/api/v1/volume/daily?bucket=hourly&hours=24" | jq
```

Atteso:
- HTTP 200
- `data.bucket = "hourly"`
- `data.series` array

## 2.5 Network health

```zsh
curl -s $AUTH_HEADER "$BASE_URL/api/v1/network/health" | jq
```

Atteso:
- HTTP 200
- `data.agents`, `data.escrows`, `data.growth`, `data.expiringEscrows`

---

## 3) Test negativi M3

## 3.1 hours invalido

```zsh
curl -s $AUTH_HEADER "$BASE_URL/api/v1/escrows/alerts?hours=-1" | jq
```

Atteso:
- HTTP 400
- `error.code = INVALID_PARAM`

## 3.2 bucket invalido

```zsh
curl -s $AUTH_HEADER "$BASE_URL/api/v1/volume/daily?bucket=weekly" | jq
```

Atteso:
- HTTP 400
- `error.code = INVALID_PARAM`

## 3.3 limiti oltre cap

```zsh
curl -s $AUTH_HEADER "$BASE_URL/api/v1/escrows/alerts?hours=99999" | jq
curl -s $AUTH_HEADER "$BASE_URL/api/v1/volume/daily?bucket=daily&days=99999" | jq
curl -s $AUTH_HEADER "$BASE_URL/api/v1/volume/daily?bucket=hourly&hours=99999" | jq
```

Atteso:
- HTTP 200
- valori clampati ai massimi server-side

---

## 4) Check headers standard

```zsh
curl -i -s $AUTH_HEADER "$BASE_URL/api/v1/volume" | sed -n '1,35p'
```

Atteso:
- `X-Request-Id`
- `X-Data-Source`
- `X-Data-Age`
- `Cache-Control`
- (se applicabile) header rate limit

---

## 5) Checklist finale M3

- [ ] `escrows/alerts` ok
- [ ] `volume` ok
- [ ] `volume/daily` daily ok
- [ ] `volume/daily` hourly ok
- [ ] `network/health` ok
- [ ] test negativi (`INVALID_PARAM`) ok
- [ ] headers standard presenti

