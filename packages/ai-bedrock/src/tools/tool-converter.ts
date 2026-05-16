import type { Tool } from '@tanstack/ai'
import type { Tool as BedrockTool, ToolInputSchema } from '@aws-sdk/client-bedrock-runtime'

export type BedrockFunctionTool = BedrockTool

export function convertToolsToProviderFormat(
  tools: Array<Tool>,
): Array<BedrockFunctionTool> {
  return tools.map((tool): BedrockFunctionTool => ({
    toolSpec: {
      name: tool.name,
      description: tool.description,
      inputSchema: {
        json: tool.inputSchema ?? { type: 'object', properties: {}, required: [] },
      } as unknown as ToolInputSchema,
    },
  }))
}
