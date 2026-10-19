import assert from 'node:assert/strict'
import { afterEach, test } from 'node:test'
import { getBase58Decoder } from '@solana/kit'
import { Keypair } from '@solana/web3.js'
import { z } from 'zod'
import { createAgent } from '../src/agent.js'
import { loadConfig } from '../src/core/index.js'
import { systemPrompt } from '../src/prompt.js'
import { createTools, TOOL_ACTIONS } from '../src/tools.js'
import { BONK, DEXRA, ENV, dexraResult, mockFetch, type Routes } from './helpers.js'

let restore = () => {}
afterEach(() => restore())

function setup(routes: Routes, env: Record<string, string> = {}) {
  const m = mockFetch(routes)
  restore = m.restore
  const { agent, config } = createAgent({ ...ENV, ...env })
  return { ...m, agent, config, tools: createTools(agent) }
}

const options = { toolCallId: 'test', messages: [] } as never
async function run(tools: ReturnType<typeof createTools>, name: string, input: Record<string, unknown>) {
  return (await tools[name]!.execute!(input, options)) as Record<string, any>
}

test('exposes exactly the guarded tool set', () => {
  const { tools, agent } = setup({})
  assert.deepEqual(Object.keys(tools).sort(), ['buy', 'check_token', 'describe_address', 'fresh_launches', 'preflight', 'sell'])
  // The published Dexra plugin registered its actions, and so did the trade plugin.
  for (const action of Object.values(TOOL_ACTIONS)) assert.ok(agent.actions.some((a) => a.name === action), action)
})

test('an unguarded trade action from another plugin never becomes a tool', () => {
  const { agent } = setup({})
  agent.use({
    name: 'token',
    methods: {},
    initialize() {},
    actions: [{ name: 'TRADE', similes: [], description: 'swap', examples: [], schema: z.object({}), handler: async () => ({}) }],
  })
  const tools = createTools(agent)
  assert.equal(Object.keys(tools).length, 6)
  assert.ok(!Object.values(tools).some((t) => t.description === 'swap'))
})

test('check_token calls token_deep_check with the key', async () => {
  const { tools, calls } = setup({ [`GET ${DEXRA}/token_deep_check`]: dexraResult('ok', ['fine']) })
  const out = await run(tools, 'check_token', { mint: BONK })
  assert.equal(out.status, 'success')
  assert.equal(out.result.verdict, 'ok')
  assert.equal(calls[0]!.url.searchParams.get('mint'), BONK)
  assert.equal(calls[0]!.headers.authorization, 'Bearer dxr_test')
})

test('preflight and fresh_launches pass their arguments', async () => {
  const { tools, calls } = setup({
    [`GET ${DEXRA}/swap_preflight`]: dexraResult('caution'),
    [`GET ${DEXRA}/new_launches`]: { body: { result: { launches: [], summary: 'none' } } },
  })
  assert.equal((await run(tools, 'preflight', { mint: BONK, side: 'buy', amount: 0.01 })).result.verdict, 'caution')
  assert.equal((await run(tools, 'fresh_launches', { minutes: 15, limit: 3 })).status, 'success')
  assert.equal(calls[0]!.url.searchParams.get('side'), 'buy')
  assert.equal(calls[0]!.url.searchParams.get('amount'), '0.01')
  assert.equal(calls[1]!.url.searchParams.get('minutes'), '15')
})

test('a bad address is refused by the schema without a call', async () => {
  const { tools, calls } = setup({})
  const out = await run(tools, 'check_token', { mint: 'nope' })
  assert.equal(out.status, 'error')
  assert.equal(calls.length, 0)
})

test('buy goes through the guard: ok and ok is a dry run with no Jupiter call', async () => {
  const { tools, calls } = setup({
    [`GET ${DEXRA}/token_deep_check`]: dexraResult('ok'),
    [`GET ${DEXRA}/swap_preflight`]: dexraResult('ok'),
  })
  const out = await run(tools, 'buy', { mint: BONK, amount_sol: 0.01 })
  assert.equal(out.status, 'dry_run')
  assert.equal(out.mode, 'dry_run')
  assert.equal(out.signature, null)
  assert.equal(out.input.amountAtomic, '10000000')
  assert.deepEqual(out.decision.verdicts, { token: 'ok', preflight: 'ok' })
  assert.ok(!calls.some((c) => c.url.host === 'api.jup.ag'))
})

test('buy is blocked on avoid, with the reasons', async () => {
  const { tools } = setup({
    [`GET ${DEXRA}/token_deep_check`]: dexraResult('avoid', ['mint authority is live']),
    [`GET ${DEXRA}/swap_preflight`]: dexraResult('ok'),
  })
  const out = await run(tools, 'buy', { mint: BONK, amount_sol: 0.01 })
  assert.equal(out.status, 'blocked')
  assert.equal(out.ok, false)
  assert.ok(out.decision.reasons.includes('token_deep_check: mint authority is live'))
})

test('buy over MAX_TRADE_SOL is refused before any call', async () => {
  const { tools, calls } = setup({})
  const out = await run(tools, 'buy', { mint: BONK, amount_sol: 1 })
  assert.equal(out.status, 'blocked')
  assert.match(out.message, /above MAX_TRADE_SOL 0.05/)
  assert.equal(calls.length, 0)
})

test('buy fails closed when Dexra answers 402', async () => {
  const { tools } = setup({
    [`GET ${DEXRA}/token_deep_check`]: { status: 402, body: { error: 'payment_required', context: 'pay' } },
    [`GET ${DEXRA}/swap_preflight`]: dexraResult('ok'),
  })
  const out = await run(tools, 'buy', { mint: BONK, amount_sol: 0.01 })
  assert.equal(out.status, 'blocked')
  assert.match(out.message, /token_deep_check failed/)
})

test('sell is not blocked by avoid and reports the verdict', async () => {
  const { tools } = setup({
    [`GET ${DEXRA}/describe_address`]: { body: { result: { stats: { decimals: 5 }, summary: 'token' } } },
    [`GET ${DEXRA}/swap_preflight`]: dexraResult('avoid', ['thin pool']),
  })
  const out = await run(tools, 'sell', { mint: BONK, amount_atomic: '100000000' })
  assert.equal(out.status, 'dry_run')
  assert.equal(out.decision.verdicts.preflight, 'avoid')
  assert.equal(out.input.amount, 1000)
})

test('dry run needs no key: the SAK wallet is a fresh random keypair', () => {
  const a = createAgent({}).agent.wallet.publicKey.toBase58()
  const b = createAgent({}).agent.wallet.publicKey.toBase58()
  assert.notEqual(a, b)
})

test('live uses the configured key, and a bad key is not echoed', () => {
  const pair = Keypair.generate()
  const secret = getBase58Decoder().decode(pair.secretKey)
  const live = { DRY_RUN: 'false', SOLANA_PRIVATE_KEY: secret, JUPITER_API_KEY: 'jup' }
  assert.equal(createAgent(live).agent.wallet.publicKey.toBase58(), pair.publicKey.toBase58())
  assert.throws(() => createAgent({ ...live, SOLANA_PRIVATE_KEY: 'not-a-key' }), (e: Error) => !e.message.includes('not-a-key'))
})

test('the system prompt says dry run and the cap', () => {
  const prompt = systemPrompt(loadConfig({}))
  assert.match(prompt, /DRY RUN/)
  assert.match(prompt, /0\.05 SOL per buy/)
  assert.match(prompt, /Never retry/)
})
