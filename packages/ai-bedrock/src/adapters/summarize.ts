import { BaseSummarizeAdapter } from '@tanstack/ai/adapters'
import { BedrockTextAdapter } from './text'
import type { StreamChunk, SummarizationOptions, SummarizationResult } from '@tanstack/ai'
import type { BedrockTextConfig } from './text'
import type { BedrockTextModels } from '../model-meta'

export interface BedrockSummarizeConfig extends BedrockTextConfig {
  /** Default temperature for summarization (0-1). Defaults to 0.3. */
  temperature?: number
  /** Default maximum tokens in the response */
  maxTokens?: number
}

export interface BedrockSummarizeProviderOptions {
  temperature?: number
  maxTokens?: number
}

export class BedrockSummarizeAdapter<
  TModel extends BedrockTextModels,
> extends BaseSummarizeAdapter<TModel, BedrockSummarizeProviderOptions> {
  readonly kind = 'summarize' as const
  readonly name = 'bedrock' as const

  private textAdapter: BedrockTextAdapter<TModel>
  private temperature: number
  private maxTokens: number | undefined

  constructor(config: BedrockSummarizeConfig, model: TModel) {
    super({}, model)
    this.textAdapter = new BedrockTextAdapter(config, model)
    this.temperature = config.temperature ?? 0.3
    this.maxTokens = config.maxTokens
  }

  async summarize(options: SummarizationOptions): Promise<SummarizationResult> {
    const systemPrompt = this.buildSummarizationPrompt(options)

    let summary = ''
    const id = ''
    let model = options.model
    let usage = { promptTokens: 0, completionTokens: 0, totalTokens: 0 }

    try {
      for await (const chunk of this.textAdapter.chatStream({
        model: options.model,
        messages: [{ role: 'user', content: options.text }],
        systemPrompts: [systemPrompt],
        maxTokens: this.maxTokens ?? options.maxLength,
        temperature: this.temperature,
      })) {
        if (chunk.type === 'TEXT_MESSAGE_CONTENT') {
          if (chunk.content) {
            summary = chunk.content
          } else {
            summary += chunk.delta
          }
          model = chunk.model || model
        }
        if (chunk.type === 'RUN_FINISHED') {
          if (chunk.usage) {
            usage = chunk.usage
          }
        }
        if (chunk.type === 'RUN_ERROR') {
          throw new Error(`Error during summarization: ${chunk.error?.message}`)
        }
      }
    } catch (error) {
      throw error
    }

    return { id, model, summary, usage }
  }

  async *summarizeStream(options: SummarizationOptions): AsyncIterable<StreamChunk> {
    const systemPrompt = this.buildSummarizationPrompt(options)

    try {
      yield* this.textAdapter.chatStream({
        model: options.model,
        messages: [{ role: 'user', content: options.text }],
        systemPrompts: [systemPrompt],
        maxTokens: this.maxTokens ?? options.maxLength,
        temperature: this.temperature,
      })
    } catch (error) {
      throw error
    }
  }

  private buildSummarizationPrompt(options: SummarizationOptions): string {
    let prompt = 'You are a professional summarizer. '

    switch (options.style) {
      case 'bullet-points':
        prompt += 'Provide a summary in bullet point format. '
        break
      case 'paragraph':
        prompt += 'Provide a summary in paragraph format. '
        break
      case 'concise':
        prompt += 'Provide a very concise summary in 1-2 sentences. '
        break
      default:
        prompt += 'Provide a clear and concise summary. '
    }

    if (options.focus && options.focus.length > 0) {
      prompt += `Focus on the following aspects: ${options.focus.join(', ')}. `
    }

    if (options.maxLength) {
      prompt += `Keep the summary under ${options.maxLength} tokens. `
    }

    return prompt
  }
}

export function createBedrockSummarize<TModel extends BedrockTextModels>(
  model: TModel,
  config?: BedrockSummarizeConfig,
): BedrockSummarizeAdapter<TModel> {
  return new BedrockSummarizeAdapter(config ?? {}, model)
}

export function bedrockSummarize<TModel extends BedrockTextModels>(
  model: TModel,
  config?: BedrockSummarizeConfig,
): BedrockSummarizeAdapter<TModel> {
  return createBedrockSummarize(model, config)
}
