import type { Action, Plugin } from 'solana-agent-kit'
import { z } from 'zod'
import { buy, sell, type Config } from './core/index.js'

export const BUY_ACTION = 'DEXRA_GUARDED_BUY'
export const SELL_ACTION = 'DEXRA_GUARDED_SELL'

/** SAK actions for buy and sell built on the core, so every buy passes the Dexra guard. */
export function createDexraTradePlugin(config: Config): Plugin {
  const mode = config.live ? 'LIVE: sends a real transaction' : `dry run (${config.dryRunReason}): nothing is sent`

  const buyAction: Action = {
    name: BUY_ACTION,
    similes: ['buy token', 'ape into token', 'swap SOL for token'],
    description:
      `Buy a Solana token with SOL through Jupiter, only if Dexra's token_deep_check and swap_preflight both pass. ` +
      `At most ${config.maxTradeSol} SOL per buy. A blocked buy returns status "blocked" with the reasons. Mode: ${mode}.`,
    examples: [
      [
        {
          input: { mint: 'DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263', amount_sol: 0.01 },
          output: { status: 'dry_run', ok: true },
          explanation: 'Buy BONK for 0.01 SOL after Dexra checks it',
        },
      ],
    ],
    schema: z.object({
      mint: z.string().describe('Token mint to buy'),
      amount_sol: z.number().positive().describe(`SOL to spend, at most ${config.maxTradeSol}`),
    }),
    handler: async (_agent, input) => ({ ...(await buy(String(input.mint), Number(input.amount_sol), config)) }),
  }

  const sellAction: Action = {
    name: SELL_ACTION,
    similes: ['sell token', 'exit position', 'swap token for SOL'],
    description:
      `Sell a Solana token for SOL through Jupiter. Never blocked by a verdict, so a position can always exit; ` +
      `the swap_preflight verdict is reported. Amount is in the token's smallest units. Mode: ${mode}.`,
    examples: [
      [
        {
          input: { mint: 'DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263', amount_atomic: '100000000' },
          output: { status: 'dry_run', ok: true },
          explanation: 'Sell 1000 BONK (5 decimals)',
        },
      ],
    ],
    schema: z.object({
      mint: z.string().describe('Token mint to sell'),
      amount_atomic: z.string().regex(/^\d+$/).describe("Amount in the token's smallest units, as a whole number"),
    }),
    handler: async (_agent, input) => ({ ...(await sell(String(input.mint), String(input.amount_atomic), config)) }),
  }

  return { name: 'dexra-trade', methods: {}, actions: [buyAction, sellAction], initialize() {} }
}
