// Runs the tool layer without an LLM, forced into dry run: check, preflight, launches, then a guarded buy.
import { createAgent } from '../src/agent.js'
import { loadConfig } from '../src/core/index.js'
import { createTools } from '../src/tools.js'

const BONK = 'DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263'
const env = { ...process.env, DRY_RUN: 'true' }
const { agent, config } = createAgent(env, loadConfig(env))
const tools = createTools(agent)
const options = { toolCallId: 'dry-run', messages: [] } as never

console.log(`Dexra ${config.dexraBaseUrl}; SAK wallet ${agent.wallet.publicKey.toBase58()} (random, dry run)`)
console.log(`Tools: ${Object.keys(tools).join(', ')}`)

const calls: [string, Record<string, unknown>][] = [
  ['check_token', { mint: BONK }],
  ['preflight', { mint: BONK, side: 'buy', amount: 0.01 }],
  ['fresh_launches', { minutes: 15, limit: 3 }],
  ['buy', { mint: BONK, amount_sol: 0.01 }],
]
for (const [name, input] of calls) {
  const out = (await tools[name]!.execute!(input, options)) as Record<string, any>
  console.log(`\n== ${name} ${JSON.stringify(input)}`)
  if (name === 'buy') console.log(JSON.stringify(out, null, 2))
  else console.log(JSON.stringify({ status: out.status, verdict: out.result?.verdict, summary: out.result?.summary, message: out.message, kind: out.kind }))
}
