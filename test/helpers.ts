export const BONK = 'DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263'
export const DEXRA = 'dexra.test'
export const JUP = 'api.jup.ag'

export interface Call {
  method: string
  url: URL
  headers: Record<string, string>
}

type Reply = { status?: number; body: unknown }
export type Routes = Record<string, Reply | (() => never)>

/** Replaces globalThis.fetch with a router keyed by "METHOD host/path"; records every call. */
export function mockFetch(routes: Routes): { calls: Call[]; restore: () => void } {
  const original = globalThis.fetch
  const calls: Call[] = []
  globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = new URL(String(input))
    const method = (init?.method ?? 'GET').toUpperCase()
    const headers = Object.fromEntries(new Headers(init?.headers).entries())
    calls.push({ method, url, headers })
    const route = routes[`${method} ${url.host}${url.pathname}`]
    if (!route) throw new Error(`unexpected request ${method} ${url.host}${url.pathname}`)
    const reply = typeof route === 'function' ? route() : route
    return new Response(JSON.stringify(reply.body), { status: reply.status ?? 200, headers: { 'content-type': 'application/json' } })
  }) as typeof fetch
  return { calls, restore: () => void (globalThis.fetch = original) }
}

export function dexraResult(verdict: string | undefined, reasons: string[] = []): Reply {
  return { body: { result: { verdict, reasons, summary: `summary ${verdict}` } } }
}

export const ENV = { DEXRA_BASE_URL: `http://${DEXRA}`, DEXRA_API_KEY: 'dxr_test' }
