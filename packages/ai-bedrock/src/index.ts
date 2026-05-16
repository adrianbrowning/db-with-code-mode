// ============================================================================
// Text (Chat) adapter
// ============================================================================

export {
  BedrockTextAdapter,
  createBedrockText,
  bedrockText,
  type BedrockTextConfig,
} from './adapters/text'

// ============================================================================
// Summarize adapter
// ============================================================================

export {
  BedrockSummarizeAdapter,
  createBedrockSummarize,
  bedrockSummarize,
  type BedrockSummarizeConfig,
  type BedrockSummarizeProviderOptions,
} from './adapters/summarize'

// ============================================================================
// Types
// ============================================================================

export type {
  BedrockTextModels,
  BedrockModelOptionsByName,
  BedrockModelInputModalitiesByName,
  BedrockChatModelToolCapabilitiesByName,
} from './model-meta'

export { BEDROCK_MODELS } from './model-meta'

export type { BedrockTextProviderOptions, BedrockGuardrailConfig } from './text/text-provider-options'

export type {
  BedrockTextMetadata,
  BedrockImageMetadata,
  BedrockAudioMetadata,
  BedrockVideoMetadata,
  BedrockDocumentMetadata,
  BedrockMessageMetadataByModality,
} from './message-types'

// ============================================================================
// Tools
// ============================================================================

export { convertToolsToProviderFormat } from './tools/tool-converter'
export type { BedrockFunctionTool } from './tools/tool-converter'

// ============================================================================
// Utils
// ============================================================================

export { createBedrockClient, type BedrockClientConfig } from './utils'
