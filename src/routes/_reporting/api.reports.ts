import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createFileRoute } from '@tanstack/react-router'
import {
  chat,
  maxIterations,
  toServerSentEventsStream,
} from '@tanstack/ai'
import { createCodeMode } from '@tanstack/ai-code-mode'
import {
  createAlwaysTrustedStrategy,
  createSkillManagementTools,
  createSkillsSystemPrompt,
  skillToTool,
} from '@tanstack/ai-code-mode-skills'
import { createFileSkillStorage } from '@tanstack/ai-code-mode-skills/storage'
import { toolsToBindings } from '@tanstack/ai-code-mode'
import type { AnyTextAdapter, ServerTool } from '@tanstack/ai'
import type { IsolateDriver } from '@tanstack/ai-code-mode'

import { databaseTools } from '#/lib/tools/database-tools'
import { reportTools } from '#/lib/reports/tools'
import { createReportBindings } from '#/lib/reports/create-report-bindings'
import { bedrockText } from '@tanstack/ai-bedrock'
import type { BedrockTextModels } from '@tanstack/ai-bedrock'

const DEFAULT_MODEL = (process.env.BEDROCK_MODEL ?? 'us.anthropic.claude-sonnet-4-6-20250514-v1:0') as BedrockTextModels

function getAdapter(model?: string): AnyTextAdapter {
  return bedrockText((model ?? DEFAULT_MODEL) as BedrockTextModels)
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
  driver: IsolateDriver
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
    codeModeCache = { tool, systemPrompt, driver }
  }
  return codeModeCache
}

// --- Skills setup ---

const __dirname = fileURLToPath(new URL('.', import.meta.url))
const skillsDir = resolve(__dirname, '../../../.skills')
const trustStrategy = createAlwaysTrustedStrategy()
export const skillStorage = createFileSkillStorage({ directory: skillsDir, trustStrategy })

let skillManagementToolsCache: ReturnType<typeof createSkillManagementTools> | null = null

function getSkillManagementTools() {
  if (!skillManagementToolsCache) {
    skillManagementToolsCache = createSkillManagementTools({ storage: skillStorage, trustStrategy })
  }
  return skillManagementToolsCache
}

const SKILL_REGISTRATION_PROMPT = `## Skill Registration — MANDATORY

After every successful \`execute_typescript\` call you MUST register the code as a reusable skill using \`register_skill\` — unless an identical skill already exists.

Rules:
- \`name\`: descriptive snake_case (e.g. \`get_average_product_price\`)
- \`code\`: the TypeScript code, parameterised with an \`input\` variable where useful
- \`inputSchema\` / \`outputSchema\`: valid JSON Schema **strings**
- If a skill with the same name exists, skip registration

This is not optional — skill registration is a core part of your workflow.`

async function getSkillToolsAndPrompt(driver: IsolateDriver): Promise<{
  skillTools: Array<ServerTool<any, any, any>>
  skillsPrompt: string
}> {
  const allSkills = await skillStorage.loadAll()
  const skillIndex = await skillStorage.loadIndex()

  const skillTools =
    allSkills.length > 0
      ? (() => {
          const bindings = {
            ...toolsToBindings(databaseTools, 'external_'),
            ...createReportBindings(),
          }
          return allSkills.map((skill) =>
            skillToTool({ skill, driver, bindings, storage: skillStorage, timeout: 60000, memoryLimit: 128 })
          )
        })()
      : []

  const libraryPrompt = createSkillsSystemPrompt({
    selectedSkills: allSkills,
    totalSkillCount: skillIndex.length,
    skillsAsTools: true,
  })

  return { skillTools, skillsPrompt: libraryPrompt + '\n\n' + SKILL_REGISTRATION_PROMPT }
}

export const Route = createFileRoute('/_reporting/api/reports')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        console.log('[API Reports] POST /_reporting/api/reports')
        const requestSignal = request.signal
        if (requestSignal.aborted) {
          console.log('[API Reports] Request aborted, returning 499')
          return new Response(null, { status: 499 })
        }

        const abortController = new AbortController()
        const body = await request.json()
        const { messages, data } = body

        const model: string | undefined = data?.model

        const adapter = getAdapter(model)

        // console.log('[API Reports] Provider:', {
        //   messages,
        //   data,
        //   provider,
        //   model
        // })

        try {
          const { tool, systemPrompt, driver } = await getCodeModeTools()
          const { skillTools, skillsPrompt } = await getSkillToolsAndPrompt(driver)
          const stream = chat({
            adapter,
            messages,
            tools: [tool, ...getSkillManagementTools(), ...skillTools, ...reportTools],
            systemPrompts: [
              DATABASE_SYSTEM_PROMPT,
              systemPrompt,
              REPORTS_SYSTEM_PROMPT,
              skillsPrompt,
            ],
            agentLoopStrategy: maxIterations(20),
            abortController,
            maxTokens: 8192,
          })

          console.log('[API Reports] Stream started | AWS_ACCESS_KEY_ID present:', !!process.env.AWS_ACCESS_KEY_ID)

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
