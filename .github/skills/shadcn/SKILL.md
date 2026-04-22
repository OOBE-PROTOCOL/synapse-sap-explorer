---
name: shadcn-explorer
description: 'Build, extend, and refactor UI components in the Synapse SAP Explorer. Use when: creating new pages, adding components, styling with the design system, adding shadcn primitives, composing explorer pages with ExplorerPageShell/ExplorerSection, applying glassmorphism tokens. DO NOT skip this skill when touching any file in src/components/ or src/app/.'
---

# shadcn Explorer — UI Skill

## When to Use

- Creating or editing any file in `src/components/` or `src/app/`
- Adding a new shadcn primitive (`Button`, `Badge`, `Card`, `Dialog`, etc.)
- Building a new explorer page with header, stats, and table
- Styling with Tailwind inside this project
- Reviewing a component for design-system compliance
- Debugging visual inconsistencies (wrong shadow, wrong color token)

---

## Setup — Library Config

| Setting | Value |
|---------|-------|
| Style | `new-york` |
| Base color | `neutral` |
| CSS Variables | `true` |
| Icon library | `lucide-react` |
| RSC | `true` |
| Alias — ui | `~/components/ui` |
| Alias — utils | `~/lib/utils` |

**Add a new shadcn component:**
```bash
pnpm dlx shadcn@latest add <component-name>
```
Then customize variants to match the design system (see section below).

---

## Design System — CSS Variables

All tokens live in `src/app/globals.css`. Never hard-code hex colors. Always use semantic CSS variables.

### Core Semantic Tokens (light + dark automated)

| Token | Purpose |
|-------|---------|
| `hsl(var(--primary))` | Synapse violet — interactive elements, CTAs |
| `hsl(var(--primary-foreground))` | Text on primary bg |
| `hsl(var(--muted-foreground))` | Secondary labels, descriptions |
| `hsl(var(--card))` | Card background |
| `hsl(var(--border))` | Default border |
| `hsl(var(--ring))` | Focus ring |
| `hsl(var(--destructive))` | Error / danger |
| `hsl(var(--accent))` | Soft accent bg |

### Synapse Extended Tokens

| Token | Value (dark) | Use |
|-------|-------------|-----|
| `--glow` | `262 83% 62%` | Violet glow — shadows, borders, hovers |
| `--glow-muted` | `262 40% 48%` | Softer glow for secondary elements |
| `--neon-cyan` | `186 100% 62%` | Cyan signal — secondary accent |
| `--neon-emerald` | `160 84% 55%` | Green signal — success, active |
| `--surface-0/1/2` | depth layers | Surface hierarchy |

**Pattern for glow shadows:**
```tsx
// ✅ correct — uses token
className="shadow-[0_0_12px_-4px_hsl(var(--glow)/0.3)]"

// ❌ wrong — hard-coded color
className="shadow-[0_0_12px_rgba(139,92,246,0.3)]"
```

---

## Utility CSS Classes (globals.css)

These are project-specific utility classes. Use them; do not recreate inline.

| Class | Effect |
|-------|--------|
| `gradient-text` | Violet→cyan gradient on text + glow text-shadow |
| `mesh-gradient` | Multi-radial glow background overlay |
| `dot-matrix` | Subtle grid of dots background |
| `holo-shimmer` | Animated shimmer overlay (::after pseudo) |
| `animate-fade-in` | Opacity 0→1 on mount |
| `glass-surface` | Glassmorphism card: backdrop-blur + glow border |
| `glass-surface-elevated` | Elevated glass (stronger blur, inset highlight) |
| `neon-glow` | Box-shadow with --glow |
| `neon-glow-cyan` | Box-shadow with --neon-cyan |
| `neon-glow-emerald` | Box-shadow with --neon-emerald |
| `corner-accent` | Bracket-corner decorative borders (::before/::after) |
| `scan-line` | Animated horizontal scan line |

---

## Available Components — Import Reference

All from `~/components/ui/`.

```tsx
import { Button, buttonVariants }        from '~/components/ui/button'
import { Badge, badgeVariants }          from '~/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter }
                                          from '~/components/ui/card'
import { Input }                          from '~/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue }
                                          from '~/components/ui/select'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger }
                                          from '~/components/ui/dialog'
import { Tabs, TabsList, TabsTrigger, TabsContent }
                                          from '~/components/ui/tabs'
import { Collapsible, CollapsibleContent, CollapsibleTrigger }
                                          from '~/components/ui/collapsible'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger }
                                          from '~/components/ui/tooltip'
import { Separator }                      from '~/components/ui/separator'
import { Skeleton }                       from '~/components/ui/skeleton'
import { Switch }                         from '~/components/ui/switch'
import { Label }                          from '~/components/ui/label'
import { Checkbox }                       from '~/components/ui/checkbox'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow }
                                          from '~/components/ui/table'
import { Avatar, AvatarFallback, AvatarImage }
                                          from '~/components/ui/avatar'
```

**Explorer-specific building blocks:**
```tsx
import {
  ExplorerPageShell,     // full page wrapper — header + stats + children
  ExplorerSection,       // titled content block with HUD accents
  ExplorerMetric,        // single KPI display (neon style)
  ExplorerFilterBar,     // search + filter chips + sort
  ExplorerSortHeader,    // sortable table column header
  ExplorerGrid,          // responsive grid wrapper
  ExplorerLiveDot,       // animated live indicator
  SectionDivider,        // gradient separator
} from '~/components/ui/explorer-primitives'

import {
  TimestampDisplay,      // unix timestamp → relative + absolute
  AddressDisplay,        // pubkey with copy + explorer link
  HashDisplay,           // transaction hash with copy
  BackButton,            // ← back navigation
  DetailCard,            // labeled field grid
  ExpandableSection,     // collapsible section with chevron
  EmptyState,            // no-data placeholder
  ErrorState,            // error placeholder
} from '~/components/ui/explorer'

import { AgentTag }      from '~/components/ui/agent-tag'
import { AgentAvatar }   from '~/components/ui/agent-avatar'
import { ScoreRing, StatCard, InfoGrid, InfoRow }
                          from '~/components/ui/index'
```

---

## Component Variants — Custom Tokens

### Badge

```tsx
// Standard
<Badge variant="default">Active</Badge>
<Badge variant="secondary">Protocol</Badge>
<Badge variant="outline">Draft</Badge>
<Badge variant="destructive">Error</Badge>

// Neon — use for protocol / blockchain entities
<Badge variant="neon">Primary glow</Badge>
<Badge variant="neon-cyan">Address / hash</Badge>
<Badge variant="neon-emerald">Success / active</Badge>
<Badge variant="neon-amber">Warning / pending</Badge>
<Badge variant="neon-rose">Error / rejected</Badge>

// Surface styles
<Badge variant="hud">MONO LABEL</Badge>       // uppercase mono, bracket-style
<Badge variant="glass">Glassmorphism</Badge>
<Badge variant="holographic">Iridescent</Badge>
```

### Button

```tsx
<Button variant="default">Primary action</Button>
<Button variant="outline">Secondary action</Button>
<Button variant="ghost">Tertiary / icon</Button>
<Button variant="secondary">Soft action</Button>
<Button variant="destructive">Destructive</Button>
<Button size="sm" | "default" | "lg" | "icon" />
```

### Card

The base `Card` already has:
- `bg-card/75 backdrop-blur-xl` (glassmorphism)
- `border-border/40` → hover `border-border/60`
- Layered glow shadow on hover
- `transition-all duration-300`

Compose naturally:
```tsx
<Card>
  <CardHeader>
    <CardTitle>Title</CardTitle>
    <CardDescription>Subtitle</CardDescription>
  </CardHeader>
  <CardContent>content</CardContent>
</Card>
```

For a metric panel, prefer `StatCard` from `~/components/ui/index` which already applies the right neon border and glow.

---

## Page Anatomy — Standard Pattern

Every explorer page follows this structure:

```tsx
// app/(explorer)/my-entity/page.tsx  — Server Component
import { ExplorerPageShell } from '~/components/ui/explorer-primitives'
import { MyIcon } from 'lucide-react'

export default async function MyEntityPage() {
  const data = await fetchDataServerSide()   // SDK call via server action

  return (
    <ExplorerPageShell
      title="Entity Name"
      subtitle="Short description"
      icon={<MyIcon className="h-5 w-5" />}
      badge={<Badge variant="neon-cyan">{data.count}</Badge>}
      stats={<StatsRow data={data} />}        // optional KPI row
    >
      {/* Main content — table, cards, etc. */}
      <MyEntityTable items={data.items} />
    </ExplorerPageShell>
  )
}
```

---

## Rules

### ✅ Do

- Always use `cn()` from `~/lib/utils` for conditional class merging.
- Use semantic tokens (`hsl(var(--primary))`) over hard-coded colors.
- Apply `gradient-text` to page titles and primary headings.
- Use `ExplorerPageShell` for all top-level explorer pages.
- Use `neon-*` Badge variants for blockchain entity labels (addresses, hashes, statuses).
- Use `hud` Badge variant for monospace system labels.
- Keep `'use client'` only on components that need browser APIs or interactivity.
- Compose `ExplorerSection` inside `ExplorerPageShell` for sub-sections.
- Use `TimestampDisplay` for all unix timestamps — never `new Date()` inline.
- Use `AddressDisplay` for all pubkeys — never render raw addresses without copy/link.

### ❌ Don't

- Hard-code hex colors or rgb values.
- Import `SynapseClient` or `SapClient` in client components.
- Write inline SVG gradients with fixed hex colors — use CSS var tokens.
- Use `<img>` for logos — use Next.js `<Image>` from `next/image`.
- Add `'use client'` to layout files or page-level data-fetching components.
- Use `tailwind.config` colors directly in className — use only CSS variable tokens.
- Duplicate glow shadow logic — extend `buttonVariants`/`badgeVariants` CVA if needed.
- Create new icon components — use `lucide-react` icons.

---

## Procedure — Adding a New Explorer Page

1. **Route**: Create `src/app/(explorer)/<entity>/page.tsx` (Server Component).
2. **API route**: If data needs client refresh, add `src/app/api/sap/<entity>/route.ts`.
3. **Shell**: Wrap content in `<ExplorerPageShell>`.
4. **Table/List**: Use `<Table>` from `~/components/ui/table` + `DataTable` for sortable lists.
5. **Filter bar**: Add `<ExplorerFilterBar>` if the list has search/filter.
6. **Timestamps**: All dates via `<TimestampDisplay>`.
7. **Addresses**: All pubkeys via `<AddressDisplay>`.
8. **Status**: Derive a `neon-*` Badge variant from entity state.
9. **Loading state**: Add `loading.tsx` sibling with `<Skeleton>` layout.
10. **Error state**: Add `error.tsx` sibling with `<ErrorState>`.

---

## Procedure — Refactoring an Existing Component

1. Replace hard-coded hex/rgb with CSS variable tokens.
2. Replace ad-hoc copy/link logic with `<AddressDisplay>` / `<TimestampDisplay>`.
3. Replace ad-hoc status text with appropriate `<Badge variant="neon-*">`.
4. Replace ad-hoc card divs with `<Card>` + `<CardContent>`.
5. Extract repeated patterns into `ExplorerSection` or `StatCard`.
6. Remove `'use client'` if the component has no interactivity or browser APIs.
7. Ensure `cn()` is used for all conditional class merging.

---

## Checklist — Before Shipping a Component

- [ ] No hard-coded colors (hex, rgb, hsl literals)
- [ ] `cn()` used for all conditional className merges
- [ ] `'use client'` only where browser APIs / hooks are used
- [ ] Timestamps use `<TimestampDisplay>`
- [ ] Pubkeys use `<AddressDisplay>` or `<AgentTag>`
- [ ] Status/labels use `<Badge variant="neon-*" | "hud">`
- [ ] Page uses `<ExplorerPageShell>` (top-level) or `<ExplorerSection>` (nested)
- [ ] New shadcn component added via `pnpm dlx shadcn@latest add`
- [ ] `loading.tsx` and `error.tsx` exist alongside new pages
