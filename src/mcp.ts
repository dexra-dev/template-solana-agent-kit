import { createMCPClient } from '@ai-sdk/mcp'
import type { ToolSet } from 'ai'

export const DEXRA_MCP_URL = 'https://api.dexra.dev/mcp'

/**
 * Optional: Dexra's remote MCP server (Streamable HTTP) for its full set of read-only checks.
 * Its tools get an `mcp_` prefix so they never replace the local buy and sell.
 */
export async function dexraMcpTools(apiKey: string | undefined, url = DEXRA_MCP_URL) {
  const client = await createMCPClient({
    transport: { type: 'http', url, headers: apiKey ? { Authorization: `Bearer ${apiKey}` } : {} },
    clientName: 'template-solana-agent-kit',
  })
  const tools: ToolSet = {}
  for (const [name, t] of Object.entries(await client.tools())) tools[`mcp_${name}`] = t as ToolSet[string]
  return { tools, close: () => client.close() }
}
