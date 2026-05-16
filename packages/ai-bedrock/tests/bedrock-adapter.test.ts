import { beforeEach, describe, expect, it, vi } from 'vitest'
import { resolveDebugOption } from '@tanstack/ai/adapter-internals'
import { bedrockText, createBedrockText } from '../src/adapters/text'
import { bedrockSummarize, createBedrockSummarize } from '../src/adapters/summarize'
import { createBedrockClient } from '../src/utils'
import { BEDROCK_MODELS } from '../src/model-meta'
import { convertToolsToProviderFormat } from '../src/tools/tool-converter'
import type { Tool } from '@tanstack/ai'

const testLogger = resolveDebugOption(false)

// Module-level mock handle
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let mockSend: any

vi.mock('@aws-sdk/client-bedrock-runtime', async () => {
  return {
    BedrockRuntimeClient: class {
      send(...args: Array<unknown>) {
        return mockSend(...args)
      }
    },
    ConverseStreamCommand: class {
      constructor(public input: unknown) {}
    },
    ConverseCommand: class {
      constructor(public input: unknown) {}
    },
  }
})

function makeStreamEvent(
  chunks: Array<Record<string, unknown>>,
): AsyncIterable<Record<string, unknown>> {
  return {
    [Symbol.asyncIterator]() {
      let index = 0
      return {
        async next() {
          if (index < chunks.length) {
            return { value: chunks[index++]!, done: false }
          }
          return { value: undefined as unknown as Record<string, unknown>, done: true }
        },
      }
    },
  }
}

function setupMockStream(streamEvents: Array<Record<string, unknown>>) {
  mockSend = vi.fn().mockResolvedValue({ stream: makeStreamEvent(streamEvents) })
}

describe('bedrockText / createBedrockText factories', () => {
  it('creates an adapter with createBedrockText', () => {
    const adapter = createBedrockText('amazon.nova-lite-v1:0')
    expect(adapter.name).toBe('bedrock')
    expect(adapter.kind).toBe('text')
  })

  it('creates an adapter with bedrockText alias', () => {
    const adapter = bedrockText('amazon.nova-lite-v1:0')
    expect(adapter.name).toBe('bedrock')
    expect(adapter.kind).toBe('text')
  })

  it('accepts client config options', () => {
    const adapter = createBedrockText('amazon.nova-pro-v1:0', {
      region: 'us-west-2',
    })
    expect(adapter).toBeDefined()
  })
})

describe('bedrockSummarize / createBedrockSummarize factories', () => {
  it('creates an adapter with createBedrockSummarize', () => {
    const adapter = createBedrockSummarize('amazon.nova-lite-v1:0')
    expect(adapter.name).toBe('bedrock')
    expect(adapter.kind).toBe('summarize')
  })

  it('creates an adapter with bedrockSummarize alias', () => {
    const adapter = bedrockSummarize('amazon.nova-lite-v1:0')
    expect(adapter.name).toBe('bedrock')
    expect(adapter.kind).toBe('summarize')
  })
})

describe('createBedrockClient', () => {
  it('creates a client with region', () => {
    const client = createBedrockClient({ region: 'eu-west-1' })
    expect(client).toBeDefined()
  })

  it('creates a client with empty config (uses AWS_REGION env)', () => {
    process.env['AWS_REGION'] = 'us-east-1'
    const client = createBedrockClient({})
    expect(client).toBeDefined()
    delete process.env['AWS_REGION']
  })
})

describe('BEDROCK_MODELS', () => {
  it('exports an array of model IDs', () => {
    expect(Array.isArray(BEDROCK_MODELS)).toBe(true)
    expect(BEDROCK_MODELS.length).toBeGreaterThan(0)
  })

  it('includes expected models', () => {
    expect(BEDROCK_MODELS).toContain('amazon.nova-lite-v1:0')
    expect(BEDROCK_MODELS).toContain('amazon.nova-pro-v1:0')
    expect(BEDROCK_MODELS).toContain('amazon.nova-micro-v1:0')
    expect(BEDROCK_MODELS).toContain('amazon.titan-text-premier-v1:0')
  })
})

describe('convertToolsToProviderFormat', () => {
  it('converts a simple tool to Bedrock toolSpec format', () => {
    const tools: Array<Tool> = [
      {
        name: 'get_weather',
        description: 'Returns weather for a location',
        inputSchema: {
          type: 'object',
          properties: { location: { type: 'string' } },
          required: ['location'],
        },
      },
    ]
    const result = convertToolsToProviderFormat(tools)
    expect(result).toHaveLength(1)
    expect(result[0]).toMatchObject({
      toolSpec: {
        name: 'get_weather',
        description: 'Returns weather for a location',
        inputSchema: {
          json: {
            type: 'object',
            properties: { location: { type: 'string' } },
            required: ['location'],
          },
        },
      },
    })
  })

  it('handles tool with empty description', () => {
    const tools: Array<Tool> = [{ name: 'noop', description: '' }]
    const result = convertToolsToProviderFormat(tools)
    expect(result[0]?.toolSpec?.description).toBe('')
  })

  it('handles tool with no inputSchema', () => {
    const tools: Array<Tool> = [{ name: 'ping', description: 'ping' }]
    const result = convertToolsToProviderFormat(tools)
    expect(result[0]?.toolSpec?.inputSchema).toMatchObject({
      json: { type: 'object', properties: {}, required: [] },
    })
  })
})

describe('BedrockTextAdapter streaming', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    process.env['AWS_REGION'] = 'us-east-1'
  })

  it('emits RUN_STARTED and RUN_FINISHED for a simple text response', async () => {
    setupMockStream([
      { contentBlockStart: { contentBlockIndex: 0, start: { text: '' } } },
      { contentBlockDelta: { contentBlockIndex: 0, delta: { text: 'Hello!' } } },
      { messageStop: { stopReason: 'end_turn' } },
    ])

    const adapter = createBedrockText('amazon.nova-lite-v1:0')
    const chunks: Array<{ type: string }> = []

    for await (const chunk of adapter.chatStream({
      model: 'amazon.nova-lite-v1:0',
      messages: [{ role: 'user', content: 'Hi' }],
      logger: testLogger,
    })) {
      chunks.push(chunk as { type: string })
    }

    const types = chunks.map((c) => c.type)
    expect(types).toContain('RUN_STARTED')
    expect(types).toContain('TEXT_MESSAGE_START')
    expect(types).toContain('TEXT_MESSAGE_CONTENT')
    expect(types).toContain('TEXT_MESSAGE_END')
    expect(types).toContain('RUN_FINISHED')
  })

  it('emits tool call events', async () => {
    setupMockStream([
      {
        contentBlockStart: {
          contentBlockIndex: 0,
          start: { toolUse: { toolUseId: 'tu_1', name: 'get_weather' } },
        },
      },
      {
        contentBlockDelta: {
          contentBlockIndex: 0,
          delta: { toolUse: { input: '{"location":"Berlin"}' } },
        },
      },
      { messageStop: { stopReason: 'tool_use' } },
    ])

    const adapter = createBedrockText('amazon.nova-lite-v1:0')
    const chunks: Array<{ type: string }> = []

    for await (const chunk of adapter.chatStream({
      model: 'amazon.nova-lite-v1:0',
      messages: [{ role: 'user', content: 'Weather in Berlin?' }],
      logger: testLogger,
    })) {
      chunks.push(chunk as { type: string })
    }

    const types = chunks.map((c) => c.type)
    expect(types).toContain('TOOL_CALL_START')
    expect(types).toContain('TOOL_CALL_ARGS')
    expect(types).toContain('TOOL_CALL_END')

    const runFinished = chunks.find((c) => c.type === 'RUN_FINISHED') as
      | { type: string; finishReason?: string }
      | undefined
    expect(runFinished?.finishReason).toBe('tool_calls')
  })
})
