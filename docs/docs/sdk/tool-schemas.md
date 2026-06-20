# Tool Inscribed Schemas System

## Panoramica

Il sistema **Tool Inscribed Schemas** permette di estrarre, validare e utilizzare gli schemi JSON dei tool SAP direttamente dalla blockchain, fornendo:

- ✅ **Cache permanente** nel database per performance
- ✅ **Validazione automatica** dei parametri di input
- ✅ **Documentazione auto-generata** per ogni tool
- ✅ **Type safety** nelle chiamate ai tool
- ✅ **Fallback multi-RPC** per affidabilità

## Architettura

```
┌─────────────────┐
│   Tool Page     │
│  /tools/page.tsx│
└────────┬────────┘
         │
         ├─► useToolSchemas() hook
         │
         ├─► SchemaValidator component
         │    └─► Validazione form in tempo reale
         │
         └─► SchemaDocumentation component
              └─► Documentazione automatica
         
┌─────────────────┐
│  API Route      │
│  /api/sap/tools │
│  /schemas       │
└────────┬────────┘
         │
         ├─► GET: Fetch schemas cached
         │
         └─► POST: Trigger scan on-chain
              │
              ├─► Mainnet RPC (primary)
              │
              └─► OOBEP RPC (fallback)
                   
┌─────────────────┐
│   Database      │
│ tool_schemas    │
└─────────────────┘
```

## Utilizzo

### 1. Scansionare gli Schemas

Dalla pagina **Tools** (`/tools`):

```tsx
// Clicca il bottone "Scan Schemas"
// Oppure programma lo scan:

await fetch('/api/sap/tools/schemas', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ force: false }),
});
```

**Parametri POST:**
- `force: boolean` (default: `false`) - Se `true`, riscrive tutti gli schemas anche se già cached

**Risposta:**
```json
{
  "totalTools": 42,
  "scanned": 42,
  "withSchema": 38,
  "errors": []
}
```

### 2. Fetchare gli Schemas Cached

```tsx
import { useToolSchemas } from '~/hooks/use-tool-schemas';

function MyComponent() {
  const { data: schemasData, loading, error } = useToolSchemas();
  
  // schemasData.schemas = [
  //   {
  //     toolPda: "5QWg...",
  //     schemaHash: "abc123...",
  //     schemaJson: { type: "object", properties: {...} },
  //     inscribedAt: 1234567890
  //   }
  // ]
}
```

### 3. Validazione Form con SchemaValidator

```tsx
import { SchemaValidator } from '~/components/tools/schema-validator';

function ToolExecutionPanel({ toolPda }) {
  const { data: schemasData } = useToolSchemas();
  const schema = schemasData?.schemas?.find(s => s.toolPda === toolPda)?.schemaJson;

  return (
    <SchemaValidator
      schema={schema}
      onSubmit={async (params) => {
        // Esegui il tool con i parametri validati
        await executeTool(toolPda, params);
      }}
      submitLabel="Execute Tool"
      title="Tool Parameters"
    />
  );
}
```

**Feature del validatore:**
- ✅ Generazione automatica campi form
- ✅ Validazione real-time con react-hook-form + zod
- ✅ Indicatori required/optional
- ✅ Vincoli (min/max, pattern, enum)
- ✅ Default values

### 4. Documentazione Automatica

```tsx
import { SchemaDocumentation } from '~/components/tools/schema-documentation';

function ToolDetailPage({ toolPda }) {
  const { data: schemasData } = useToolSchemas();
  const schema = schemasData?.schemas?.find(s => s.toolPda === toolPda)?.schemaJson;

  return (
    <SchemaDocumentation
      schema={schema}
      toolName="My Tool"
      compact={false}
    />
  );
}
```

**Feature della documentazione:**
- ✅ Lista parametri con tipi
- ✅ Badge required/optional
- ✅ Default values
- ✅ Vincoli visuali (min/max, pattern)
- ✅ Enum values
- ✅ Description per ogni campo

## Database Schema

### Tabella `tool_schemas`

```sql
CREATE TABLE tool_schemas (
    id            SERIAL PRIMARY KEY,
    tool_pda      TEXT NOT NULL UNIQUE,
    schema_hash   TEXT,
    schema_json   JSONB NOT NULL DEFAULT '{}',
    inscribed_at  BIGINT,
    tx_signature  TEXT,
    slot          BIGINT,
    indexed_at    TIMESTAMPTZ DEFAULT NOW()
);
```

**Indici:**
- `idx_tool_schemas_tool_pda` - Lookup veloce per tool PDA
- `idx_tool_schemas_indexed_at` - Ordine per recente indicizzazione

## API Reference

### GET /api/sap/tools/schemas

**Risposta:**
```typescript
{
  schemas: Array<{
    toolPda: string;
    schemaHash: string;
    schemaJson: Record<string, unknown>;
    inscribedAt: number;
  }>;
  total: number;
}
```

### POST /api/sap/tools/schemas

**Body:**
```json
{
  "force": false
}
```

**Risposta:**
```json
{
  "totalTools": 42,
  "scanned": 42,
  "withSchema": 38,
  "errors": []
}
```

## Hook Reference

### useToolSchemas()

```typescript
function useToolSchemas(): {
  data: {
    schemas: Array<{
      toolPda: string;
      schemaHash: string;
      schemaJson: Record<string, unknown>;
      inscribedAt: number;
    }>;
    total: number;
  } | null;
  loading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
}
```

**Polling:** 60 secondi (configurabile)

### triggerSchemaScan(force: boolean)

```typescript
async function triggerSchemaScan(force = false): Promise<{
  totalTools: number;
  scanned: number;
  withSchema: number;
  errors: string[];
}>
```

## Esempi Pratici

### Esempio 1: Tool Detail Page con Schema

```tsx
'use client';

import { useToolSchemas } from '~/hooks/use-tool-schemas';
import { SchemaValidator } from '~/components/tools/schema-validator';
import { SchemaDocumentation } from '~/components/tools/schema-documentation';

export default function ToolDetailPage({ params }: { params: { pda: string } }) {
  const { data: schemasData } = useToolSchemas();
  const schema = schemasData?.schemas?.find(s => s.toolPda === params.pda)?.schemaJson;

  if (!schema) {
    return <div>No schema available for this tool</div>;
  }

  return (
    <div className="space-y-6">
      {/* Documentazione */}
      <SchemaDocumentation 
        schema={schema} 
        toolName="My Tool"
      />

      {/* Form di esecuzione */}
      <SchemaValidator
        schema={schema}
        onSubmit={async (data) => {
          // Chiama il tool con i parametri validati
          console.log('Executing tool with:', data);
        }}
      />
    </div>
  );
}
```

### Esempio 2: Batch Scan Programmato

```tsx
// Esegui scan ogni 24 ore
useEffect(() => {
  const interval = setInterval(async () => {
    try {
      const result = await triggerSchemaScan(false);
      console.log(`Scheduled scan: ${result.withSchema} schemas found`);
    } catch (err) {
      console.error('Scheduled scan failed:', err);
    }
  }, 24 * 60 * 60 * 1000); // 24 ore

  return () => clearInterval(interval);
}, []);
```

### Esempio 3: Validazione Personalizzata

```tsx
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';

function CustomValidator({ schema, toolPda }) {
  // Converti schema JSON in zod
  const zodSchema = z.object({
    // Costruisci manualmente o usa schemaToZod()
    param1: z.string().min(1),
    param2: z.number().min(0).max(100),
  });

  const form = useForm({
    resolver: zodResolver(zodSchema),
  });

  const onSubmit = async (data) => {
    // I dati sono già validati
    await callTool(toolPda, data);
  };

  return (
    <form onSubmit={form.handleSubmit(onSubmit)}>
      {/* Campi personalizzati */}
    </form>
  );
}
```

## Best Practices

### 1. Cache-First Strategy

Gli schemas vengono cached nel DB dopo il primo fetch. Usa sempre `useToolSchemas()` per accedere alla cache invece di fare RPC live.

```tsx
// ✅ GOOD
const { data } = useToolSchemas();

// ❌ BAD
const response = await fetch('/api/sap/tools/schemas');
```

### 2. Graceful Degradation

Gestisci il caso in cui uno schema non è disponibile:

```tsx
if (!schema) {
  return (
    <Alert>
      <AlertCircle className="h-4 w-4" />
      <AlertDescription>
        Schema not available. Tool execution may fail without validation.
      </AlertDescription>
    </Alert>
  );
}
```

### 3. Error Handling

Gli errori di scan vengono raccolti nell'array `errors`:

```tsx
const result = await triggerSchemaScan();
if (result.errors.length > 0) {
  console.warn('Some tools failed to scan:', result.errors);
}
```

### 4. Performance

- **Polling:** 60s di default, aumenta per ridurre load
- **Batch size:** 10 tools per batch (configurabile in `route.ts`)
- **Rate limiting:** 100ms delay tra batch

## Troubleshooting

### Problema: Schema non viene trovato

**Soluzione:**
1. Esegui uno scan: `POST /api/sap/tools/schemas`
2. Controlla i log del server per errori RPC
3. Verifica che il tool abbia effettivamente uno schema inscribed on-chain

### Problema: Validazione fallisce

**Soluzione:**
1. Controlla che lo schema JSON sia valido
2. Verifica i tipi nei campi (string, number, boolean)
3. Assicurati che i required siano corretti

### Problema: Performance lente

**Soluzione:**
1. Aumenta il polling interval (default 60s)
2. Riduci il batch size (default 10)
3. Usa solo la cache DB invece di RPC live

## Roadmap

- [ ] Supporto per output schema validation
- [ ] Auto-generazione TypeScript types da schema
- [ ] Mock data generation per testing
- [ ] Schema versioning e migration
- [ ] OpenAPI/Swagger export

## Resources

- [JSON Schema Specification](https://json-schema.org/)
- [Zod Documentation](https://zod.dev/)
- [React Hook Form](https://react-hook-form.com/)
- [SAP SDK Docs](https://synapse.oobeprotocol.ai/)
