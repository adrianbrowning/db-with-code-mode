import type { BedrockTextProviderOptions } from './text/text-provider-options'

interface ModelMeta<TProviderOptions = unknown> {
  name: string
  id: string
  supports: {
    input: ReadonlyArray<'text' | 'image' | 'audio' | 'video' | 'document'>
    tools?: ReadonlyArray<string>
  }
  context_window?: number
  max_output_tokens?: number
  pricing: {
    input: { normal: number; cached?: number }
    output: { normal: number }
  }
  providerOptions?: TProviderOptions
}

// ---------------------------------------------------------------------------
// Anthropic Claude models via Bedrock
// ---------------------------------------------------------------------------

const ANTHROPIC_CLAUDE_OPUS_4_6 = {
  name: 'Claude Opus 4.6 (Bedrock)',
  id: 'us.anthropic.claude-opus-4-6-20250514-v1:0',
  context_window: 200_000,
  max_output_tokens: 32_000,
  supports: {
    input: ['text'] as const,
    tools: ['function'] as const,
  },
  pricing: { input: { normal: 15 }, output: { normal: 75 } },
} as const satisfies ModelMeta<BedrockTextProviderOptions>

const ANTHROPIC_CLAUDE_SONNET_4_6 = {
  name: 'Claude Sonnet 4.6 (Bedrock)',
  id: 'us.anthropic.claude-sonnet-4-6-20250514-v1:0',
  context_window: 200_000,
  max_output_tokens: 64_000,
  supports: {
    input: ['text'] as const,
    tools: ['function'] as const,
  },
  pricing: { input: { normal: 3 }, output: { normal: 15 } },
} as const satisfies ModelMeta<BedrockTextProviderOptions>

const ANTHROPIC_CLAUDE_3_5_SONNET_V2 = {
  name: 'Claude 3.5 Sonnet v2 (Bedrock)',
  id: 'anthropic.claude-3-5-sonnet-20241022-v2:0',
  context_window: 200_000,
  max_output_tokens: 8_192,
  supports: {
    input: ['text'] as const,
    tools: ['function'] as const,
  },
  pricing: { input: { normal: 3 }, output: { normal: 15 } },
} as const satisfies ModelMeta<BedrockTextProviderOptions>

const ANTHROPIC_CLAUDE_3_5_HAIKU_V1 = {
  name: 'Claude 3.5 Haiku (Bedrock)',
  id: 'anthropic.claude-3-5-haiku-20241022-v1:0',
  context_window: 200_000,
  max_output_tokens: 8_192,
  supports: {
    input: ['text'] as const,
    tools: ['function'] as const,
  },
  pricing: { input: { normal: 0.8 }, output: { normal: 4 } },
} as const satisfies ModelMeta<BedrockTextProviderOptions>

const ANTHROPIC_CLAUDE_3_HAIKU_V1 = {
  name: 'Claude 3 Haiku (Bedrock)',
  id: 'anthropic.claude-3-haiku-20240307-v1:0',
  context_window: 200_000,
  max_output_tokens: 4_096,
  supports: {
    input: ['text'] as const,
    tools: ['function'] as const,
  },
  pricing: { input: { normal: 0.25 }, output: { normal: 1.25 } },
} as const satisfies ModelMeta<BedrockTextProviderOptions>

// ---------------------------------------------------------------------------
// Amazon Nova models
// ---------------------------------------------------------------------------

const AMAZON_NOVA_PRO_V1 = {
  name: 'Amazon Nova Pro',
  id: 'amazon.nova-pro-v1:0',
  context_window: 300_000,
  max_output_tokens: 5_120,
  supports: {
    input: ['text'] as const,
    tools: ['function'] as const,
  },
  pricing: { input: { normal: 0.8 }, output: { normal: 3.2 } },
} as const satisfies ModelMeta<BedrockTextProviderOptions>

const AMAZON_NOVA_LITE_V1 = {
  name: 'Amazon Nova Lite',
  id: 'amazon.nova-lite-v1:0',
  context_window: 300_000,
  max_output_tokens: 5_120,
  supports: {
    input: ['text'] as const,
    tools: ['function'] as const,
  },
  pricing: { input: { normal: 0.06 }, output: { normal: 0.24 } },
} as const satisfies ModelMeta<BedrockTextProviderOptions>

const AMAZON_NOVA_MICRO_V1 = {
  name: 'Amazon Nova Micro',
  id: 'amazon.nova-micro-v1:0',
  context_window: 128_000,
  max_output_tokens: 5_120,
  supports: {
    input: ['text'] as const,
    tools: ['function'] as const,
  },
  pricing: { input: { normal: 0.035 }, output: { normal: 0.14 } },
} as const satisfies ModelMeta<BedrockTextProviderOptions>

// ---------------------------------------------------------------------------
// Amazon Titan
// ---------------------------------------------------------------------------

const AMAZON_TITAN_TEXT_PREMIER_V1 = {
  name: 'Amazon Titan Text Premier',
  id: 'amazon.titan-text-premier-v1:0',
  context_window: 32_000,
  max_output_tokens: 3_072,
  supports: {
    input: ['text'] as const,
    tools: [] as const,
  },
  pricing: { input: { normal: 0.5 }, output: { normal: 1.5 } },
} as const satisfies ModelMeta<BedrockTextProviderOptions>

// ---------------------------------------------------------------------------
// Meta Llama
// ---------------------------------------------------------------------------

const META_LLAMA3_3_70B_INSTRUCT_V1 = {
  name: 'Meta Llama 3.3 70B Instruct',
  id: 'meta.llama3-3-70b-instruct-v1:0',
  context_window: 128_000,
  max_output_tokens: 8_192,
  supports: {
    input: ['text'] as const,
    tools: ['function'] as const,
  },
  pricing: { input: { normal: 0.72 }, output: { normal: 0.72 } },
} as const satisfies ModelMeta<BedrockTextProviderOptions>

// ---------------------------------------------------------------------------
// Mistral
// ---------------------------------------------------------------------------

const MISTRAL_LARGE_2407_V1 = {
  name: 'Mistral Large (2407)',
  id: 'mistral.mistral-large-2407-v1:0',
  context_window: 128_000,
  max_output_tokens: 8_192,
  supports: {
    input: ['text'] as const,
    tools: ['function'] as const,
  },
  pricing: { input: { normal: 3 }, output: { normal: 9 } },
} as const satisfies ModelMeta<BedrockTextProviderOptions>

// ---------------------------------------------------------------------------
// Public exports
// ---------------------------------------------------------------------------

export const BEDROCK_MODELS = [
  ANTHROPIC_CLAUDE_OPUS_4_6.id,
  ANTHROPIC_CLAUDE_SONNET_4_6.id,
  ANTHROPIC_CLAUDE_3_5_SONNET_V2.id,
  ANTHROPIC_CLAUDE_3_5_HAIKU_V1.id,
  ANTHROPIC_CLAUDE_3_HAIKU_V1.id,
  AMAZON_NOVA_PRO_V1.id,
  AMAZON_NOVA_LITE_V1.id,
  AMAZON_NOVA_MICRO_V1.id,
  AMAZON_TITAN_TEXT_PREMIER_V1.id,
  META_LLAMA3_3_70B_INSTRUCT_V1.id,
  MISTRAL_LARGE_2407_V1.id,
] as const

export type BedrockTextModels = (typeof BEDROCK_MODELS)[number]

/** Per-model provider options. All Bedrock models share the same options. */
export type BedrockModelOptionsByName = {
  [K in BedrockTextModels]: BedrockTextProviderOptions
}

/** Per-model input modalities (all text-only for now). */
export type BedrockModelInputModalitiesByName = {
  [K in BedrockTextModels]: readonly ['text']
}

/** Per-model tool capabilities. */
export type BedrockChatModelToolCapabilitiesByName = {
  [K in BedrockTextModels]: K extends
    | typeof AMAZON_TITAN_TEXT_PREMIER_V1.id
    ? readonly []
    : readonly ['function']
}
