import { createInterface } from 'node:readline/promises'
import { anthropic } from '@ai-sdk/anthropic'
import { openai } from '@ai-sdk/openai'
import { generateText, isStepCount, type LanguageModel, type ModelMessage, type ToolSet } from 'ai'
import { createAgent } from './agent.js'
import { DEXRA_MCP_URL, dexraMcpTools } from './mcp.js'
import { systemPrompt } from './prompt.js'
import { createTools } from './tools.js'

const DEFAULT_MODELS = { openai: 'gpt-5.6-luna', anthropic: 'claude-sonnet-5-5' } as const

function pickModel(env: NodeJS.ProcessEnv): { model: LanguageModel; label: string } {
  const provider = (env.LLM_PROVIDER?.trim().toLowerCase() || (env.ANTHROPIC_API_KEY ? 'anthropic' : 'openai')) as string
  if (provider !== 'openai' && provider !== 'anthropic') throw new Error(`LLM_PROVIDER must be openai or anthropic, got "${provider}"`)
  const id = env.LLM_MODEL?.trim() || DEFAULT_MODELS[provider]
  return { model: provider === 'openai' ? openai(id) : anthropic(id), label: `${provider}/${id}` }
}

const { agent, config } = createAgent()
const { model, label } = pickModel(process.env)

let tools: ToolSet = createTools(agent)
let closeMcp = async () => {}
if (['true', '1', 'yes', 'on'].includes(process.env.DEXRA_MCP?.trim().toLowerCase() ?? '')) {
  const mcp = await dexraMcpTools(config.dexraApiKey, process.env.DEXRA_MCP_URL?.trim() || DEXRA_MCP_URL)
  tools = { ...mcp.tools, ...tools }
  closeMcp = mcp.close
}

console.log(`Model ${label}. ${config.live ? 'LIVE trading.' : `Dry run: ${config.dryRunReason}.`} Max ${config.maxTradeSol} SOL per buy.`)
console.log(`Tools: ${Object.keys(tools).join(', ')}. Type "exit" to quit.\n`)

const messages: ModelMessage[] = []
const rl = createInterface({ input: process.stdin, output: process.stdout })
try {
  while (true) {
    const line = (await rl.question('you> ')).trim()
    if (!line) continue
    if (line === 'exit' || line === 'quit') break
    messages.push({ role: 'user', content: line })
    try {
      const result = await generateText({
        model,
        instructions: systemPrompt(config),
        messages,
        tools,
        stopWhen: isStepCount(8),
        onStepFinish: (step) => {
          for (const call of step.toolCalls) console.log(`  [tool] ${call.toolName} ${JSON.stringify(call.input)}`)
        },
      })
      messages.push(...result.response.messages)
      console.log(`\nagent> ${result.text}\n`)
    } catch (error) {
      messages.pop()
      console.error(`error: ${error instanceof Error ? error.message : String(error)}\n`)
    }
  }
} finally {
  rl.close()
  await closeMcp()
}
