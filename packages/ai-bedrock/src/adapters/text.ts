import {
  ConverseCommand,
  ConverseStreamCommand,
} from '@aws-sdk/client-bedrock-runtime'
import { BaseTextAdapter } from '@tanstack/ai/adapters'
import { generateId as utilGenerateId } from '@tanstack/ai-utils'
import { createBedrockClient } from '../utils'
import { modelMessagesToBedrockMessages } from './message-converter'
import type {
  Tool as BedrockTool,
  ConverseStreamCommandInput,
  ToolInputSchema,
} from '@aws-sdk/client-bedrock-runtime'
import type {
  BedrockModelInputModalitiesByName,
  BedrockModelOptionsByName,
  BedrockTextModels,
} from '../model-meta'
import type { BedrockTextProviderOptions } from '../text/text-provider-options'
import type { BedrockClientConfig } from '../utils'
import type {
  StructuredOutputOptions,
  StructuredOutputResult,
} from '@tanstack/ai/adapters'
import type { DefaultMessageMetadataByModality, StreamChunk, TextOptions, Tool } from '@tanstack/ai'

const asChunk = (chunk: Record<string, unknown>) => chunk as unknown as StreamChunk

type ResolveProviderOptions<TModel extends string> =
  TModel extends keyof BedrockModelOptionsByName
    ? BedrockModelOptionsByName[TModel]
    : BedrockTextProviderOptions

type ResolveInputModalities<TModel extends string> =
  TModel extends keyof BedrockModelInputModalitiesByName
    ? BedrockModelInputModalitiesByName[TModel]
    : readonly ['text']

// Per-block tool call state tracked during streaming
interface ToolBlockState {
  id: string
  name: string
  index: number
  started: boolean
}

export interface BedrockTextConfig extends BedrockClientConfig {}

export class BedrockTextAdapter<
  TModel extends BedrockTextModels,
> extends BaseTextAdapter<
  TModel,
  ResolveProviderOptions<TModel>,
  ResolveInputModalities<TModel>,
  DefaultMessageMetadataByModality
> {
  readonly kind = 'text' as const
  readonly name = 'bedrock' as const

  private client: ReturnType<typeof createBedrockClient>

  constructor(config: BedrockTextConfig, model: TModel) {
    super({}, model)
    this.client = createBedrockClient(config)
  }

  protected generateId(): string {
    return utilGenerateId(this.name)
  }

  async *chatStream(
    options: TextOptions<ResolveProviderOptions<TModel>>,
  ): AsyncIterable<StreamChunk> {
    const timestamp = Date.now()
    const runId = this.generateId()
    const threadId = this.generateId()
    const messageId = this.generateId()

    const modelOptions = options.modelOptions as BedrockTextProviderOptions | undefined

    const params: ConverseStreamCommandInput = {
      modelId: this.model,
      messages: modelMessagesToBedrockMessages(options.messages),
      system: options.systemPrompts?.length
        ? options.systemPrompts.map((text) => ({ text }))
        : undefined,
      toolConfig: options.tools?.length
        ? { tools: convertToolsToBedrockFormat(options.tools) }
        : undefined,
      inferenceConfig: {
        ...(options.maxTokens !== undefined && { maxTokens: options.maxTokens }),
        ...(options.temperature !== undefined && { temperature: options.temperature }),
        ...(options.topP !== undefined && { topP: options.topP }),
      },
      ...(modelOptions?.guardrailConfig && { guardrailConfig: modelOptions.guardrailConfig }),
      ...(modelOptions?.additionalModelRequestFields && {
        // Cast needed: AWS SDK uses recursive DocumentType, Record<string,unknown> is wider
        additionalModelRequestFields: modelOptions.additionalModelRequestFields as unknown as ConverseStreamCommandInput['additionalModelRequestFields'],
      }),
      ...(modelOptions?.requestMetadata && { requestMetadata: modelOptions.requestMetadata }),
    }

    try {
      const response = await this.client.send(
        new ConverseStreamCommand(params),
        { abortSignal: options.abortController?.signal ?? undefined },
      )

      const stream = response.stream
      if (!stream) {
        yield asChunk({
          type: 'RUN_STARTED', runId, threadId, model: this.model, timestamp,
        })
        yield asChunk({
          type: 'RUN_ERROR', runId, model: this.model, timestamp,
          message: 'No stream in Bedrock response', code: 'no_stream',
          error: { message: 'No stream in Bedrock response', code: 'no_stream' },
        })
        return
      }

      let hasEmittedRunStarted = false
      let hasEmittedTextStart = false
      let stopReason: string | null = null

      // Track open tool blocks by their block index (Bedrock sends index in contentBlockStart)
      let blockCounter = -1
      const toolBlocks = new Map<number, ToolBlockState>()
      let toolCallCounter = 0

      for await (const event of stream) {
        if (event.contentBlockStart) {
          blockCounter++
          const cbStartEvent = event.contentBlockStart as { start?: unknown; contentBlockIndex?: number }
          const cbIndex = cbStartEvent.contentBlockIndex ?? blockCounter
          const start = cbStartEvent.start
          if (start && typeof start === 'object' && 'toolUse' in start) {
            const tu = (start as { toolUse?: { toolUseId?: string; name?: string } }).toolUse
            toolBlocks.set(cbIndex, {
              id: tu?.toolUseId ?? this.generateId(),
              name: tu?.name ?? '',
              index: toolCallCounter++,
              started: false,
            })
          }
        }

        if (event.contentBlockDelta) {
          const delta = (event.contentBlockDelta as { delta?: unknown; contentBlockIndex?: number }).delta
          const blockIdx = (event.contentBlockDelta as { contentBlockIndex?: number }).contentBlockIndex ?? blockCounter

          if (!hasEmittedRunStarted) {
            hasEmittedRunStarted = true
            yield asChunk({ type: 'RUN_STARTED', runId, threadId, model: this.model, timestamp })
          }

          if (delta && typeof delta === 'object' && 'text' in delta) {
            const text = (delta as { text?: string }).text ?? ''
            if (text) {
              if (!hasEmittedTextStart) {
                hasEmittedTextStart = true
                yield asChunk({
                  type: 'TEXT_MESSAGE_START',
                  messageId,
                  model: this.model,
                  timestamp,
                  role: 'assistant',
                })
              }
              yield asChunk({
                type: 'TEXT_MESSAGE_CONTENT',
                messageId,
                model: this.model,
                timestamp,
                delta: text,
              })
            }
          } else if (delta && typeof delta === 'object' && 'toolUse' in delta) {
            const inputChunk = (delta as { toolUse?: { input?: string } }).toolUse?.input
            const block = toolBlocks.get(blockIdx)

            if (block) {
              if (!block.started) {
                block.started = true
                yield asChunk({
                  type: 'TOOL_CALL_START',
                  toolCallId: block.id,
                  toolName: block.name,
                  toolCallName: block.name,
                  model: this.model,
                  timestamp,
                  index: block.index,
                })
              }
              if (inputChunk) {
                yield asChunk({
                  type: 'TOOL_CALL_ARGS',
                  toolCallId: block.id,
                  model: this.model,
                  timestamp,
                  delta: inputChunk,
                })
              }
            }
          }
        }

        if (event.messageStop) {
          stopReason = (event.messageStop as { stopReason?: string }).stopReason ?? null

          if (hasEmittedTextStart) {
            yield asChunk({ type: 'TEXT_MESSAGE_END', messageId, model: this.model, timestamp })
          }

          for (const block of toolBlocks.values()) {
            if (block.started) {
              yield asChunk({
                type: 'TOOL_CALL_END',
                toolCallId: block.id,
                toolName: block.name,
                toolCallName: block.name,
                model: this.model,
                timestamp,
              })
            }
          }
        }

        // Stream-level error events from Bedrock
        for (const errorKey of [
          'internalServerException',
          'modelStreamErrorException',
          'throttlingException',
          'validationException',
        ] as const) {
          const errEvent = (event as unknown as Record<string, unknown>)[errorKey]
          if (errEvent && typeof errEvent === 'object') {
            const errMsg =
              (errEvent as { originalMessage?: string; message?: string }).originalMessage ??
              (errEvent as { message?: string }).message ??
              errorKey
            yield asChunk({
              type: 'RUN_ERROR', runId, model: this.model, timestamp,
              message: errMsg, code: errorKey,
              error: { message: errMsg, code: errorKey },
            })
          }
        }
      }

      if (!hasEmittedRunStarted) {
        yield asChunk({ type: 'RUN_STARTED', runId, threadId, model: this.model, timestamp })
      }

      const finishReason =
        stopReason === 'tool_use' ? 'tool_calls'
        : stopReason === 'max_tokens' ? 'length'
        : 'stop'

      yield asChunk({
        type: 'RUN_FINISHED', runId, threadId, model: this.model, timestamp, finishReason,
      })
    } catch (error: unknown) {
      const err = error as Error & { name?: string; $fault?: string }
      const errorName = err.name || 'UnknownError'
      const errorMessages: Record<string, string> = {
        AccessDeniedException: 'AWS credentials lack Bedrock permission. Check IAM policy.',
        ValidationException: `Bedrock validation error: ${err.message}`,
        ThrottlingException: 'Bedrock rate limit exceeded.',
        ServiceUnavailableException: 'Bedrock service temporarily unavailable.',
        ResourceNotFoundException: `Model not found or not enabled in region: ${this.model}`,
      }
      const message = errorMessages[errorName] ?? `Bedrock error (${errorName}): ${err.message}`

      yield asChunk({
        type: 'RUN_ERROR', runId, model: this.model, timestamp,
        message, code: errorName,
        error: { message, code: errorName },
      })
    }
  }

  /**
   * Structured output via forced Bedrock tool call.
   * Uses ConverseCommand (non-streaming) with toolChoice forcing `structured_output` tool.
   */
  async structuredOutput(
    options: StructuredOutputOptions<ResolveProviderOptions<TModel>>,
  ): Promise<StructuredOutputResult<unknown>> {
    const { chatOptions, outputSchema } = options

    const bedrockMessages = modelMessagesToBedrockMessages(chatOptions.messages)
    const modelOptions = chatOptions.modelOptions as BedrockTextProviderOptions | undefined

    try {
      const response = await this.client.send(
        new ConverseCommand({
          modelId: this.model,
          messages: bedrockMessages,
          system: chatOptions.systemPrompts?.length
            ? chatOptions.systemPrompts.map((text) => ({ text }))
            : undefined,
          toolConfig: {
            tools: [
              {
                toolSpec: {
                  name: 'structured_output',
                  description: 'Use this tool to provide your response in the required structured format.',
                  inputSchema: { json: outputSchema } as unknown as ToolInputSchema,
                },
              },
            ],
            toolChoice: { tool: { name: 'structured_output' } },
          },
          inferenceConfig: {
            ...(chatOptions.maxTokens !== undefined && { maxTokens: chatOptions.maxTokens }),
            ...(chatOptions.temperature !== undefined && { temperature: chatOptions.temperature }),
          },
          ...(modelOptions?.guardrailConfig && { guardrailConfig: modelOptions.guardrailConfig }),
        }),
        { abortSignal: chatOptions.abortController?.signal ?? undefined },
      )

      const output = response.output
      if (!output?.message?.content) {
        throw new Error('Bedrock structured output: empty response')
      }

      for (const block of output.message.content) {
        if (block.toolUse?.name === 'structured_output' && block.toolUse.input) {
          const parsed = block.toolUse.input
          return { data: parsed, rawText: JSON.stringify(parsed) }
        }
      }

      // Fallback: try text content
      const rawText = output.message.content
        .map((b) => ('text' in b ? (b.text ?? '') : ''))
        .join('')
      if (!rawText) {
        throw new Error('Bedrock structured output: no tool_use or text content in response')
      }
      return { data: JSON.parse(rawText), rawText }
    } catch (error: unknown) {
      const err = error as Error
      if (err instanceof SyntaxError) {
        throw new Error(`Failed to parse Bedrock structured output as JSON: ${err.message}`)
      }
      throw new Error(`Bedrock structured output failed: ${err.message || 'Unknown error'}`)
    }
  }
}

function convertToolsToBedrockFormat(tools: Array<Tool>): Array<BedrockTool> {
  return tools.map((tool): BedrockTool => ({
    toolSpec: {
      name: tool.name,
      description: tool.description,
      // inputSchema is pre-converted to JSON Schema by @tanstack/ai core.
      // Cast through unknown to satisfy AWS SDK's recursive DocumentType constraint.
      inputSchema: {
        json: (tool.inputSchema ?? { type: 'object', properties: {}, required: [] }),
      } as unknown as ToolInputSchema,
    },
  }))
}

export function createBedrockText<TModel extends BedrockTextModels>(
  model: TModel,
  config?: BedrockTextConfig,
): BedrockTextAdapter<TModel> {
  return new BedrockTextAdapter(config ?? {}, model)
}

export function bedrockText<TModel extends BedrockTextModels>(
  model: TModel,
  config?: BedrockTextConfig,
): BedrockTextAdapter<TModel> {
  return createBedrockText(model, config)
}
