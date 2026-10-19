# Dexra + Solana Agent Kit

A [Solana Agent Kit](https://github.com/sendaifun/solana-agent-kit) agent that asks [Dexra](https://dexra.dev/docs/templates?utm_source=github&utm_medium=referral&utm_campaign=templates&utm_content=template-solana-agent-kit) for a verdict before every buy. If the verdict is `ok`, it buys through Jupiter; if it is `caution`, `avoid` or `unknown`, or Dexra can't be reached, the buy is blocked and the agent tells you why. You talk to it in an interactive terminal chat built on the Vercel AI SDK, with OpenAI or Anthropic as the model. Dexra's read-only checks come from the published [`@dexra-dev/plugin-solana-agent-kit`](https://www.npmjs.com/package/@dexra-dev/plugin-solana-agent-kit); buy and sell come from a small local plugin built on the shared trading core.

## Safety

- It runs as a dry run by default. Nothing is sent unless `DRY_RUN=false`, `SOLANA_PRIVATE_KEY` and `JUPITER_API_KEY` are all set.
- In a dry run the Solana Agent Kit wallet is a random keypair made at start-up, so no key is needed.
- Each buy is capped at `MAX_TRADE_SOL` (0.05 SOL by default). A larger buy is refused, not reduced. Slippage is `SLIPPAGE_BPS` (100 by default, at most 1000).
- A buy is blocked when `token_deep_check` or `swap_preflight` returns anything but `ok` (`caution` passes only with `ALLOW_CAUTION=true`), when a verdict is missing, or when Dexra fails in any way, including 402, 429, 5xx and network errors.
- Sells are never blocked by a verdict, so you can always exit. The preflight verdict is still reported.
- The Solana Agent Kit token plugin is not loaded. Its `TRADE` action swaps without asking Dexra. The model only sees the tools listed in `src/tools.ts`, so an action from a plugin you add later doesn't become a tool unless you list it there.
- Use a dedicated wallet that holds little SOL. The cap limits each trade, not all trades together.

Not financial advice. A Dexra `ok` means launches like it survived more often in our published report, not that the price will go up.

## Quick start

Click **Use this template** on GitHub, or:

```sh
git clone https://github.com/dexra-dev/template-solana-agent-kit.git
cd template-solana-agent-kit
cp .env.example .env    # set DEXRA_API_KEY and OPENAI_API_KEY or ANTHROPIC_API_KEY
npm install
npm run chat
```

Get a Dexra key at [dexra.dev/app/keys](https://dexra.dev/app/keys?utm_source=github&utm_medium=referral&utm_campaign=templates&utm_content=template-solana-agent-kit). The free tier gives 100 credits a day. Dexra also offers pay-per-call over x402; this template uses an API key.

Try: `check DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263 and buy 0.01 SOL if it passes`.

To run the tools without a model (forced dry run):

```sh
npm run dry-run
```

Node 22.9 or newer is required (Solana Agent Kit needs Node 22).

## Configuration

| Variable | Default | Meaning |
| - | - | - |
| `DEXRA_API_KEY` | unset | `dxr_…` key. Without it, paid checks answer 402, so every buy is blocked. |
| `DEXRA_BASE_URL` | `https://api.dexra.dev` | Point it at a local API for testing. |
| `DEXRA_MCP` | `false` | `true` also connects Dexra's remote MCP server. Its read-only tools are added with an `mcp_` prefix; buy and sell stay local. |
| `DEXRA_MCP_URL` | `https://api.dexra.dev/mcp` | MCP endpoint (Streamable HTTP, `Authorization: Bearer $DEXRA_API_KEY`). |
| `DRY_RUN` | `true` | Only `false`/`0`/`no`/`off` turn it off. |
| `MAX_TRADE_SOL` | `0.05` | Hard cap per buy. |
| `SLIPPAGE_BPS` | `100` | Jupiter slippage, a whole number from 0 to 1000. |
| `ALLOW_CAUTION` | `false` | When true, a `caution` verdict passes. |
| `SOLANA_PRIVATE_KEY` | unset | Base58 64-byte secret key. Read only when live; never logged. |
| `JUPITER_API_KEY` | unset | Needed live. In a dry run it adds a Jupiter quote. |
| `SOLANA_RPC_URL` | `https://api.mainnet-beta.solana.com` | RPC for the Solana Agent Kit connection. |
| `LLM_PROVIDER` | `anthropic` if `ANTHROPIC_API_KEY` is set, else `openai` | `openai` or `anthropic`. |
| `LLM_MODEL` | `gpt-5.6-luna` / `claude-sonnet-5-5` | Any model id the provider accepts. |
| `OPENAI_API_KEY`, `ANTHROPIC_API_KEY` | unset | Key for the chosen provider. |

## How the guard works

The agent is `new SolanaAgentKit(wallet, rpcUrl, {}).use(DexraPlugin).use(DexraTradePlugin)`. The model gets six tools:

| Tool | Solana Agent Kit action | From |
| - | - | - |
| `check_token` | `DEXRA_TOKEN_DEEP_CHECK` | `@dexra-dev/plugin-solana-agent-kit` |
| `preflight` | `DEXRA_SWAP_PREFLIGHT` | `@dexra-dev/plugin-solana-agent-kit` |
| `fresh_launches` | `DEXRA_NEW_LAUNCHES` | `@dexra-dev/plugin-solana-agent-kit` |
| `describe_address` | `DEXRA_DESCRIBE_ADDRESS` (free) | `@dexra-dev/plugin-solana-agent-kit` |
| `buy` | `DEXRA_GUARDED_BUY` | `src/plugin.ts`, core `buy` |
| `sell` | `DEXRA_GUARDED_SELL` | `src/plugin.ts`, core `sell` |

`buy` calls the core, which checks the amount against the cap, runs `token_deep_check` and `swap_preflight` in parallel, and only then asks Jupiter Swap API v2 for an order. Live, it signs the order with `SOLANA_PRIVATE_KEY` and sends it to `/execute`. Every result is plain JSON with a `status` of `blocked`, `dry_run`, `executed`, `failed` or `error`, plus the verdicts and reasons. The full rules are in the [trading core docs](https://dexra.dev/docs/templates?utm_source=github&utm_medium=referral&utm_campaign=templates&utm_content=template-solana-agent-kit).

Solana Agent Kit 2.0.10 has a `createVercelAITools` helper, but it targets AI SDK v4: it names tools `"0"`, `"1"`, … and passes the schema as `parameters`, which current AI SDK ignores, so the model would see empty schemas. `src/tools.ts` does the same job for AI SDK v7, using Solana Agent Kit's own `executeAction`.

## Project layout

```
src/
  core/        Dexra trading core (guard, Jupiter, config), copied as is
  agent.ts     Solana Agent Kit agent, wallet and plugins
  plugin.ts    buy and sell as Solana Agent Kit actions on the core
  tools.ts     the allowlist of actions the model can call, as AI SDK tools
  mcp.ts       optional Dexra MCP tools
  prompt.ts    system prompt
  chat.ts      terminal chat
scripts/
  dry-run.ts   the tools without a model, in dry run
test/          tool wiring with mocked HTTP
```

## Links

- [Dexra template docs](https://dexra.dev/docs/templates?utm_source=github&utm_medium=referral&utm_campaign=templates&utm_content=template-solana-agent-kit)
- [Dexra API keys](https://dexra.dev/app/keys?utm_source=github&utm_medium=referral&utm_campaign=templates&utm_content=template-solana-agent-kit)
- [How Dexra verdicts held up](https://dexra.dev/accuracy?utm_source=github&utm_medium=referral&utm_campaign=templates&utm_content=template-solana-agent-kit)
- [Solana Agent Kit](https://github.com/sendaifun/solana-agent-kit)
- [Vercel AI SDK](https://ai-sdk.dev/docs)
- [Jupiter Swap API](https://developers.jup.ag/docs/swap/order-and-execute)

## License

MIT
