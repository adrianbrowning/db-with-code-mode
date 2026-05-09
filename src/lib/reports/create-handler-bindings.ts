import { z } from 'zod'
import { convertSchemaToJsonSchema } from '@tanstack/ai'
import type { ToolBinding } from '@tanstack/ai-code-mode'
import type { BindingSignalMetadata, Report, UIEffect, UIUpdate } from './types'

export interface HandlerBindingContext {
  report: Report
  onEffect: (effect: UIEffect) => void
  onUIUpdate: (update: UIUpdate) => void
  onBindingCall?: (bindingName: string) => void
}

export const BINDING_SIGNAL_METADATA: Record<string, BindingSignalMetadata> = {
  external_ui_toast: {},
  external_report_update_component: {},
  external_report_remove_component: {},
}

export function getInvalidatedSignals(bindingName: string): string[] {
  return BINDING_SIGNAL_METADATA[bindingName]?.invalidates || []
}

export function getBindingSignal(bindingName: string): string | undefined {
  return BINDING_SIGNAL_METADATA[bindingName]?.signal
}

const noop = async () => ({ success: true })

function createBinding(
  name: string,
  description: string,
  inputSchema: z.ZodTypeAny,
  execute: ToolBinding['execute'],
): ToolBinding {
  return {
    name,
    description,
    inputSchema: convertSchemaToJsonSchema(inputSchema) || {
      type: 'object',
      properties: {},
    },
    outputSchema: convertSchemaToJsonSchema(z.object({ success: z.boolean() })),
    execute,
  }
}

export function createHandlerBindings(
  context?: HandlerBindingContext,
  _reportId?: string,
  _canvasId: string = 'diagram',
): Record<string, ToolBinding> {
  const track = (name: string) => context?.onBindingCall?.(name)

  return {
    external_ui_toast: createBinding(
      'external_ui_toast',
      'Show a toast message in the UI',
      z.object({
        message: z.string(),
        variant: z.enum(['default', 'success', 'error']).optional(),
      }),
      context
        ? async (params) => {
            track('external_ui_toast')
            const parsed = z
              .object({
                message: z.string(),
                variant: z.enum(['default', 'success', 'error']).optional(),
              })
              .parse(params)
            context.onEffect({
              type: 'toast',
              params: parsed,
            })
            return { success: true }
          }
        : noop,
    ),
    external_report_update_component: createBinding(
      'external_report_update_component',
      'Update a report component props',
      z.object({
        componentId: z.string(),
        props: z.record(z.string(), z.unknown()),
      }),
      context
        ? async (params) => {
            track('external_report_update_component')
            const parsed = z
              .object({
                componentId: z.string(),
                props: z.record(z.string(), z.unknown()),
              })
              .parse(params)
            context.onUIUpdate({
              type: 'update',
              componentId: parsed.componentId,
              props: parsed.props,
            })
            return { success: true }
          }
        : noop,
    ),
    external_report_remove_component: createBinding(
      'external_report_remove_component',
      'Remove a report component',
      z.object({
        componentId: z.string(),
      }),
      context
        ? async (params) => {
            track('external_report_remove_component')
            const parsed = z.object({ componentId: z.string() }).parse(params)
            context.onUIUpdate({
              type: 'remove',
              componentId: parsed.componentId,
            })
            return { success: true }
          }
        : noop,
    ),
  }
}
