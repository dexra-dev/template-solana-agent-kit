import { tool, type ToolSet } from 'ai'
import { executeAction, type SolanaAgentKit } from 'solana-agent-kit'
import { BUY_ACTION, SELL_ACTION } from './plugin.js'

/**
 * Tool name -> SAK action. Only these become tools. That is the point: other plugins you add
 * (for example the SAK token plugin and its TRADE action) stay off the model's tool list, so no
 * buy can skip the guard.
 */
export const TOOL_ACTIONS = {
  check_token: 'DEXRA_TOKEN_DEEP_CHECK',
  preflight: 'DEXRA_SWAP_PREFLIGHT',
  fresh_launches: 'DEXRA_NEW_LAUNCHES',
  describe_address: 'DEXRA_DESCRIBE_ADDRESS',
  buy: BUY_ACTION,
  sell: SELL_ACTION,
} as const

export type ToolName = keyof typeof TOOL_ACTIONS

/**
 * AI SDK tools from the agent's actions. SAK 2.0.10 ships createVercelAITools, but it is built
 * for AI SDK v4 (`parameters`, tools keyed "0", "1", ...), which current AI SDK rejects; this
 * does the same with `inputSchema` and readable names, through SAK's own executeAction.
 */
export function createTools(agent: SolanaAgentKit<any>): ToolSet {
  const tools: ToolSet = {}
  for (const [name, actionName] of Object.entries(TOOL_ACTIONS)) {
    const action = agent.actions.find((a) => a.name === actionName)
    if (!action) throw new Error(`action ${actionName} is not registered on the agent`)
    tools[name] = tool({
      description: action.description,
      inputSchema: action.schema,
      execute: (input: Record<string, unknown>) => executeAction(action, agent, input),
    })
  }
  return tools
}
