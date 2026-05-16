import type { ContentBlock, Message, ToolUseBlock } from '@aws-sdk/client-bedrock-runtime'
import type { ContentPart, ModelMessage } from '@tanstack/ai'

function textBlock(text: string): ContentBlock {
  return { text }
}

function getTextFromContent(content: string | null | Array<ContentPart>): string {
  if (content == null) return ''
  if (typeof content === 'string') return content
  return content
    .filter((p): p is Extract<ContentPart, { type: 'text' }> => p.type === 'text')
    .map((p) => p.content)
    .join('')
}

/**
 * Convert TanStack AI ModelMessage array to Bedrock Converse Message format.
 *
 * Key Bedrock constraints:
 * - Tool results must go in a `user` message (not `assistant`)
 * - Consecutive tool messages are batched into one user message with multiple toolResult blocks
 * - toolUse blocks live in `assistant` messages alongside text
 */
export function modelMessagesToBedrockMessages(messages: ReadonlyArray<ModelMessage>): Array<Message> {
  const out: Array<Message> = []

  for (let i = 0; i < messages.length; i++) {
    const msg = messages[i]!

    if (msg.role === 'user') {
      const text = getTextFromContent(msg.content)
      out.push({ role: 'user', content: [textBlock(text)] })
      continue
    }

    if (msg.role === 'assistant') {
      const content: Array<ContentBlock> = []

      if (typeof msg.content === 'string') {
        if (msg.content) content.push(textBlock(msg.content))
      } else if (Array.isArray(msg.content)) {
        for (const part of msg.content) {
          if (part.type === 'text') content.push(textBlock(part.content))
        }
      }

      if (msg.toolCalls) {
        for (const tc of msg.toolCalls) {
          content.push({
            toolUse: {
              toolUseId: tc.id,
              name: tc.function.name,
              // Cast through ToolUseBlock['input'] to satisfy AWS SDK's DocumentType constraint
              input: JSON.parse(tc.function.arguments || '{}') as ToolUseBlock['input'],
            },
          })
        }
      }

      if (content.length > 0) {
        out.push({ role: 'assistant', content })
      }
      continue
    }

    // Batch consecutive tool messages into a single user message with toolResult blocks
    if (msg.toolCallId) {
      const toolResultBlocks: Array<ContentBlock> = []
      while (i < messages.length && messages[i]?.role === 'tool') {
        const toolMsg = messages[i]!
        if (toolMsg.toolCallId) {
          const text =
            typeof toolMsg.content === 'string'
              ? toolMsg.content
              : JSON.stringify(toolMsg.content)
          toolResultBlocks.push({
            toolResult: {
              toolUseId: toolMsg.toolCallId,
              content: [{ text }],
            },
          })
        }
        i++
      }
      i-- // loop will increment again
      out.push({ role: 'user', content: toolResultBlocks })
    }
  }

  return out
}
