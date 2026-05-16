import { BedrockRuntimeClient } from '@aws-sdk/client-bedrock-runtime'

export interface BedrockClientConfig {
  /** AWS region. Falls back to AWS_REGION env var, then 'us-east-1'. */
  region?: string
  /** Explicit AWS credentials. When omitted, the AWS SDK default credential chain is used. */
  credentials?: {
    accessKeyId: string
    secretAccessKey: string
    sessionToken?: string
  }
  /** Custom endpoint URL for local testing or VPC endpoints. */
  endpoint?: string
}

export function createBedrockClient(config: BedrockClientConfig): BedrockRuntimeClient {
  return new BedrockRuntimeClient({
    region: config.region ?? process.env['AWS_REGION'] ?? 'us-east-1',
    credentials: config.credentials,
    ...(config.endpoint && { endpoint: config.endpoint }),
  })
}
