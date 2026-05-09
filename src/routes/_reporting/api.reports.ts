import { createFileRoute } from '@tanstack/react-router'
import {
  chat,
  maxIterations,
  toServerSentEventsStream,
} from '@tanstack/ai'
import { createCodeMode } from '@tanstack/ai-code-mode'
import { anthropicText } from '@tanstack/ai-anthropic'
import { openaiText } from '@tanstack/ai-openai'
import { geminiText } from '@tanstack/ai-gemini'
import type { AnyTextAdapter } from '@tanstack/ai'

import { databaseTools } from '#/lib/tools/database-tools'
import { reportTools } from '#/lib/reports/tools'
import { createReportBindings } from '#/lib/reports/create-report-bindings'

type Provider = 'anthropic' | 'openai' | 'gemini'

function getAdapter(provider: Provider, model?: string): AnyTextAdapter {
  switch (provider) {
    case 'openai':
      return openaiText((model || 'gpt-4o') as 'gpt-4o')
    case 'gemini':
      return geminiText((model || 'gemini-2.5-flash') as 'gemini-2.5-flash')
    case 'anthropic':
    default:
      return anthropicText(
        (model || 'claude-haiku-4-5') as 'claude-haiku-4-5',
      )
  }
}

const DATABASE_SYSTEM_PROMPT = `You are a data analyst assistant with access to a Netlify Database (Postgres) containing three tables: customers, products, and purchases.

## Database Schema

- **customers** (35 rows) — id, name, email, city, joined
  - Cities include: New York, San Francisco, Chicago, Austin, Seattle, Denver, Portland, Miami, Boston, Los Angeles, Nashville, Atlanta, Philadelphia, Minneapolis, San Diego
  - Joined dates range from mid-2024 to early 2026

- **products** (20 rows) — id, name, category, price, stock
  - Categories: Electronics, Furniture, Office
  - Prices range from $9.99 to $399.99

- **purchases** (550 rows) — id, customer_id, product_id, quantity, total, purchased_at
  - Date range: February 13 to April 13, 2026 (~2 months)
  - Quantities 1-5, totals computed from price * quantity

## Available Tools

- **queryTable** — Query any table with filtering (exact-match where), column selection, ordering, and limits
- **getSchemaInfo** — Get schema info and row counts for tables

For questions needing data from multiple tables, make multiple queryTable calls and join the data yourself. For aggregation (sums, averages, counts), query the raw data and compute the result.`

const REPORTS_SYSTEM_PROMPT = `## Report Generation

You can create interactive reports that display data visualizations. Reports build incrementally — components appear as you add them in real-time.

### Creating a Report

1. Call \`new_report({ id: 'my-report', title: 'My Report Title' })\` — this opens the report in the UI
2. Use \`execute_typescript\` with \`external_report_*\` functions to add components
3. Components appear in real-time as you add them

### Report Component Functions

Inside \`execute_typescript\`, these functions add components to a report:

**Layout (containers for other components):**
- \`external_report_vbox({ reportId, id, parentId?, gap?, align?, padding? })\` — vertical stack
- \`external_report_hbox({ reportId, id, parentId?, gap?, align?, justify?, wrap? })\` — horizontal stack
- \`external_report_grid({ reportId, id, parentId?, cols?, gap? })\` — CSS grid
- \`external_report_card({ reportId, id, parentId?, title?, subtitle?, variant? })\` — card container
- \`external_report_section({ reportId, id, parentId?, title, collapsible? })\` — collapsible section

**Content (leaf components):**
- \`external_report_text({ reportId, id?, parentId?, content, variant?, color? })\` — text with variants (h1, h2, h3, body, caption, code). \`content\` supports inline markdown (\`**bold**\`, \`*italic*\`, \`\\\`code\\\`\`, \`[link](url)\`).
- \`external_report_metric({ reportId, id?, parentId?, value, label, trend?, format? })\` — big number display
- \`external_report_badge({ reportId, id?, parentId?, label, variant? })\` — status badge
- \`external_report_markdown({ reportId, id?, parentId?, content })\` — markdown content
- \`external_report_divider({ reportId, id?, parentId? })\` — horizontal divider
- \`external_report_spacer({ reportId, id?, parentId?, size? })\` — empty space

**Data (interactive components):**
- \`external_report_chart({ reportId, id, parentId?, type, data, xKey, yKey, ... })\` — charts (line, bar, area, pie, donut). **Always pass \`parentId\` pointing at a card** (see Best Practices below).
- \`external_report_sparkline({ reportId, id?, parentId?, data })\` — inline mini chart
- \`external_report_dataTable({ reportId, id, parentId?, columns, rows, ... })\` — sortable data table. **Wrap in a card too.**
- \`external_report_progress({ reportId, id?, parentId?, value, max?, label? })\` — progress bar

**Operations:**
- \`external_report_update({ reportId, componentId, props })\` — update component props
- \`external_report_remove({ reportId, componentId })\` — remove a component
- \`external_report_reorder({ reportId, parentId, childIds })\` — reorder children

### Example: Sales by Category Report

\`\`\`typescript
const reportId = 'category-sales'

external_report_text({ reportId, content: 'Sales by Product Category', id: 'title', variant: 'h1' })

// Fetch all purchases
const { rows: purchases } = await external_queryTable({ table: 'purchases' })
const { rows: products } = await external_queryTable({ table: 'products' })

// Aggregate by category
const categoryTotals: Record<string, number> = {}
for (const p of purchases) {
  const product = products.find((pr: any) => pr.id === p.product_id)
  if (product) {
    const cat = product.category as string
    categoryTotals[cat] = (categoryTotals[cat] || 0) + (p.total as number)
  }
}

// Create metric cards
external_report_grid({ reportId, id: 'metrics-grid', cols: 3, gap: 'md' })
for (const [category, total] of Object.entries(categoryTotals)) {
  external_report_card({ reportId, id: \`card-\${category}\`, parentId: 'metrics-grid', title: category })
  external_report_metric({
    reportId,
    parentId: \`card-\${category}\`,
    value: total,
    label: 'Total Revenue',
    format: 'currency',
    prefix: '$',
  })
}

// Create pie chart wrapped in a card
const chartData = Object.entries(categoryTotals).map(([name, value]) => ({ name, value: Math.round(value) }))
external_report_card({ reportId, id: 'category-chart-card', title: 'Revenue by Category' })
external_report_chart({
  reportId,
  id: 'category-pie',
  parentId: 'category-chart-card',
  type: 'pie',
  data: chartData,
  xKey: 'name',
  yKey: 'value',
})

return { categoriesAnalyzed: Object.keys(categoryTotals).length }
\`\`\`

### Best Practices

1. **Always wrap charts in cards** — Every \`external_report_chart\` call must be a child of an \`external_report_card\`. Create the card first with a descriptive \`title\`, then add the chart with \`parentId\` set to the card's id. This gives each chart its own framed surface and a clear label. The same applies to \`external_report_dataTable\` — wrap tables in cards too.
2. **Create containers first, then content** — Add cards/sections before adding metrics/charts to them
3. **Use meaningful IDs** — Makes it easier to update or reference components later
4. **Fetch data progressively** — Add each metric/chart as data arrives, don't wait for all data
5. **Use parentId to nest** — Components without parentId go to the root level
6. **Keep reports focused** — One report per analysis topic
7. **Use queryTable to get data** — Then process/aggregate in code before visualizing
`

let codeModeCache: {
  tool: ReturnType<typeof createCodeMode>['tool']
  systemPrompt: string
} | null = null

async function getCodeModeTools() {
  if (!codeModeCache) {
    const { createIsolateDriver } = await import('#/lib/create-isolate-driver')
    const driver = await createIsolateDriver('node')
    const { tool, systemPrompt } = createCodeMode({
      driver,
      tools: databaseTools,
      timeout: 60000,
      memoryLimit: 128,
      getSkillBindings: async () => createReportBindings(),
    })
    codeModeCache = { tool, systemPrompt }
  }
  return codeModeCache
}

export const Route = createFileRoute('/_reporting/api/reports')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const requestSignal = request.signal
        if (requestSignal.aborted) {
          return new Response(null, { status: 499 })
        }

        const abortController = new AbortController()
        const body = await request.json()
        const { messages, data } = body

        const provider: Provider = data?.provider || 'anthropic'
        const model: string | undefined = data?.model

        const adapter = getAdapter(provider, model)

        try {
          const { tool, systemPrompt } = await getCodeModeTools()

          const stream = chat({
            adapter,
            messages,
            tools: [tool, ...reportTools],
            systemPrompts: [
              DATABASE_SYSTEM_PROMPT,
              systemPrompt,
              REPORTS_SYSTEM_PROMPT,
            ],
            agentLoopStrategy: maxIterations(20),
            abortController,
            maxTokens: 8192,
          })

          const sseStream = toServerSentEventsStream(stream, abortController)

          return new Response(sseStream, {
            headers: {
              'Content-Type': 'text/event-stream',
              'Cache-Control': 'no-cache',
              Connection: 'keep-alive',
            },
          })
        } catch (error: unknown) {
          console.error('[API Reports] Error:', error)

          if (
            (error instanceof Error && error.name === 'AbortError') ||
            abortController.signal.aborted
          ) {
            return new Response(null, { status: 499 })
          }

          return new Response(
            JSON.stringify({
              error:
                error instanceof Error ? error.message : 'An error occurred',
            }),
            {
              status: 500,
              headers: { 'Content-Type': 'application/json' },
            },
          )
        }
      },
    },
  },
})
