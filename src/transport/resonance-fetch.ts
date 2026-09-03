import {validateApiUrl} from '../options'

/**
 * A failed Resonance request. `kind: 'network'` means `fetch` itself rejected (typically a
 * CORS preflight failure or the host being unreachable) and `status` is `null`; `kind: 'http'`
 * means the server answered with a non-2xx status.
 *
 * @public
 */
export class ResonanceApiError extends Error {
  readonly status: number | null
  readonly kind: 'network' | 'http'
  readonly body?: unknown

  constructor(
    message: string,
    details: {status: number | null; kind: 'network' | 'http'; body?: unknown; cause?: unknown},
  ) {
    super(message, details.cause === undefined ? undefined : {cause: details.cause})
    this.name = 'ResonanceApiError'
    this.status = details.status
    this.kind = details.kind
    this.body = details.body
  }
}

/**
 * Inputs for {@link createResonanceFetch}. The getters are read on every request so a token
 * refresh or a late organization lookup is picked up without recreating the helper.
 *
 * @public
 */
export interface ResonanceFetchOptions {
  /** Resonance base URL, validated with the same rule as the plugin option. */
  apiUrl: string
  /** The current Sanity session token, or `null` when the Studio has none. */
  getToken: () => string | null
  /** The Sanity organization id, or `null` while it is still being looked up. */
  getOrganizationId: () => string | null
  /** Override the global `fetch` (tests). */
  fetch?: typeof globalThis.fetch
}

/**
 * Calls a Resonance route relative to `apiUrl` with the Sanity bearer headers attached.
 *
 * @public
 */
export interface ResonanceFetch {
  (path: string, init?: RequestInit): Promise<Response>
  /** Same as calling the function, then parsing the body as JSON. */
  json<T>(path: string, init?: RequestInit): Promise<T>
  /** The validated base URL, without a trailing slash. */
  readonly apiUrl: string
}

function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === 'AbortError'
}

async function readErrorBody(response: Response): Promise<{message: string; body: unknown}> {
  const fallback = `Resonance request failed (${response.status}${
    response.statusText ? ` ${response.statusText}` : ''
  })`

  let text = ''
  try {
    text = await response.text()
  } catch {
    return {message: fallback, body: undefined}
  }

  if (!text) return {message: fallback, body: undefined}

  try {
    const body: unknown = JSON.parse(text)
    if (body && typeof body === 'object' && 'error' in body && typeof body.error === 'string') {
      return {message: body.error, body}
    }
    return {message: fallback, body}
  } catch {
    return {message: fallback, body: text}
  }
}

/**
 * Creates the single transport used to talk to Resonance from a Studio.
 *
 * Every request carries `Authorization: Bearer <sanity token>`, `X-Resonance-Runtime: sanity`
 * and `X-Sanity-Organization-Id`, and is sent with `credentials: 'omit'` so no browser cookie is
 * ever mixed into a Sanity-authenticated request. Non-2xx responses and network
 * failures are both raised as {@link ResonanceApiError}; `AbortError` passes through untouched.
 *
 * @public
 */
export function createResonanceFetch(options: ResonanceFetchOptions): ResonanceFetch {
  const apiUrl = validateApiUrl(options.apiUrl).toString().replace(/\/+$/, '')
  const fetchImpl = options.fetch ?? globalThis.fetch.bind(globalThis)

  const request = async (path: string, init: RequestInit = {}): Promise<Response> => {
    const url = `${apiUrl}${path.startsWith('/') ? path : `/${path}`}`
    const headers = new Headers(init.headers)

    headers.set('X-Resonance-Runtime', 'sanity')
    if (!headers.has('Accept')) headers.set('Accept', 'application/json')

    const token = options.getToken()
    if (token) headers.set('Authorization', `Bearer ${token}`)

    const organizationId = options.getOrganizationId()
    if (organizationId) headers.set('X-Sanity-Organization-Id', organizationId)

    if (typeof init.body === 'string' && !headers.has('Content-Type')) {
      headers.set('Content-Type', 'application/json')
    }

    let response: Response
    try {
      response = await fetchImpl(url, {...init, headers, credentials: 'omit'})
    } catch (error) {
      if (isAbortError(error)) throw error
      throw new ResonanceApiError(
        error instanceof Error && error.message
          ? `Could not reach Resonance: ${error.message}`
          : 'Could not reach Resonance',
        {status: null, kind: 'network', cause: error},
      )
    }

    if (!response.ok) {
      const {message, body} = await readErrorBody(response)
      throw new ResonanceApiError(message, {status: response.status, kind: 'http', body})
    }

    return response
  }

  const json = async <T>(path: string, init?: RequestInit): Promise<T> => {
    const response = await request(path, init)
    try {
      // The server's JSON is trusted to match the documented shape; this is the one boundary
      // where the response type is asserted rather than validated.
      // oxlint-disable-next-line typescript/no-unsafe-type-assertion
      return (await response.json()) as T
    } catch (error) {
      if (isAbortError(error)) throw error
      throw new ResonanceApiError('Resonance returned a response that was not JSON', {
        status: response.status,
        kind: 'http',
        cause: error,
      })
    }
  }

  return Object.assign(request, {json, apiUrl})
}
