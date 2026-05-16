export type BedrockGuardrailConfig = {
  guardrailIdentifier: string
  guardrailVersion: string
  trace?: 'enabled' | 'disabled'
}

/** Provider-specific options for Bedrock Converse requests. */
export type BedrockTextProviderOptions = {
  /** Bedrock guardrail configuration to apply to the request. */
  guardrailConfig?: BedrockGuardrailConfig
  /** Additional model-specific request fields passed through to the Bedrock API. */
  additionalModelRequestFields?: Record<string, unknown>
  /** Metadata key-value pairs to attach to the Bedrock request. */
  requestMetadata?: Record<string, string>
}
