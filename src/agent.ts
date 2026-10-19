import { createDexraPlugin } from '@dexra-dev/plugin-solana-agent-kit'
import { getBase58Encoder } from '@solana/kit'
import { Keypair } from '@solana/web3.js'
import { KeypairWallet, SolanaAgentKit } from 'solana-agent-kit'
import { loadConfig, type Config } from './core/index.js'
import { createDexraTradePlugin } from './plugin.js'

export const DEFAULT_RPC_URL = 'https://api.mainnet-beta.solana.com'

type Env = Record<string, string | undefined>

/** The SAK wallet: the real key only when live; otherwise a random keypair that is never funded. */
export function createWallet(config: Config, rpcUrl: string): KeypairWallet {
  if (!config.live) return new KeypairWallet(Keypair.generate(), rpcUrl)
  const secret = config.secretKey()
  try {
    return new KeypairWallet(Keypair.fromSecretKey(getBase58Encoder().encode(secret ?? '') as Uint8Array), rpcUrl)
  } catch {
    // Never echo the key or the decoder's message, which can contain it.
    throw new Error('SOLANA_PRIVATE_KEY is not a valid base58 64-byte secret key')
  }
}

/**
 * Builds the Solana Agent Kit agent with two plugins:
 * - the published Dexra plugin for read-only checks,
 * - the local trade plugin whose buy and sell run through the core guard.
 * The SAK token plugin is not loaded: its TRADE action swaps without asking Dexra.
 */
export function createAgent(env: Env = process.env, config: Config = loadConfig(env)) {
  const rpcUrl = env.SOLANA_RPC_URL?.trim() || DEFAULT_RPC_URL
  const wallet = createWallet(config, rpcUrl)
  const dexra = createDexraPlugin({
    apiKey: config.dexraApiKey,
    baseUrl: config.dexraBaseUrl,
    // Resolve fetch per call so tests can swap globalThis.fetch.
    fetch: (input, init) => globalThis.fetch(input, init),
  })
  const agent = new SolanaAgentKit(wallet, rpcUrl, {}).use(dexra).use(createDexraTradePlugin(config))
  return { agent, config, rpcUrl }
}
