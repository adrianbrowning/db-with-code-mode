import { createFileRoute } from '@tanstack/react-router'
import { skillStorage } from '#/routes/_reporting/api.reports'

export const Route = createFileRoute('/_reporting/api/skills')({
  server: {
    handlers: {
      GET: async () => {
        try {
          const skillIndex = await skillStorage.loadIndex()
          const skillsWithStats = await Promise.all(
            skillIndex.map(async (skill) => {
              const full = await skillStorage.get(skill.name)
              return {
                id: skill.id,
                name: skill.name,
                description: skill.description,
                usageHints: skill.usageHints,
                trustLevel: skill.trustLevel,
                code: full?.code ?? '',
                stats: full?.stats ?? { executions: 0, successRate: 0 },
              }
            }),
          )
          return new Response(JSON.stringify(skillsWithStats), {
            headers: { 'Content-Type': 'application/json' },
          })
        } catch (error) {
          console.error('[API Skills] Error loading skills:', error)
          return new Response(JSON.stringify({ error: 'Failed to load skills' }), {
            status: 500,
            headers: { 'Content-Type': 'application/json' },
          })
        }
      },
    },
  },
})
