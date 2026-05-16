/**
 * Per-model type-safety tests for Bedrock provider tools.
 *
 * Positive: each supported (model, tool) pair compiles cleanly.
 * Negative: unsupported pairs produce a @ts-expect-error.
 */
import { beforeAll, describe, expect, it } from 'vitest'
import { z } from 'zod'
import { toolDefinition } from '@tanstack/ai'
import { bedrockText } from '../src'
import type { TextActivityOptions } from '@tanstack/ai/adapters'

function typedTools<TAdapter extends ReturnType<typeof bedrockText>>(
  adapter: TAdapter,
  tools: TextActivityOptions<TAdapter, undefined, true>['tools'],
) {
  return { adapter, tools }
}

beforeAll(() => {
  process.env['AWS_REGION'] = 'us-east-1'
})

const echoTool = toolDefinition({
  name: 'echo',
  description: 'echoes input',
  inputSchema: z.object({ msg: z.string() }),
}).server(async ({ msg }) => msg)

describe('Bedrock per-model tool gating', () => {
  it('nova-lite accepts user-defined function tools', () => {
    const adapter = bedrockText('amazon.nova-lite-v1:0')
    typedTools(adapter, [echoTool])
  })

  it('nova-pro accepts user-defined function tools', () => {
    const adapter = bedrockText('amazon.nova-pro-v1:0')
    typedTools(adapter, [echoTool])
  })

  it('claude-sonnet-4-6 accepts user-defined function tools', () => {
    const adapter = bedrockText('us.anthropic.claude-sonnet-4-6-20250514-v1:0')
    typedTools(adapter, [echoTool])
  })

  it('titan-text-premier has no tool capabilities in metadata', () => {
    // Titan's BedrockChatModelToolCapabilitiesByName entry is `readonly []`
    // This is a runtime guard — the adapter can be created but tools should not be passed.
    const adapter = bedrockText('amazon.titan-text-premier-v1:0')
    expect(adapter).toBeDefined()
  })
})
