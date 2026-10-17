import { HttpStatus } from '@nestjs/common';
import { ApiException } from '../../../common/errors';
import type { LvCategory, LvItem, LvMerchant, LvPaymentType, LvReceipt, LvShift, LvStore } from './loyverse.types';

export const LOYVERSE_API_BASE = 'https://api.loyverse.com/v1.0';
const PAGE = 250;
const RETRIES = 3;

export interface LoyverseClientOptions {
  /** Override for tests (`LEDGR_LOYVERSE_API_BASE`). */
  baseUrl?: string;
  fetchImpl?: typeof fetch;
  /** Pause between retries; tests pass a no-op. */
  sleep?: (ms: number) => Promise<void>;
}

export function loyverseBaseUrl(): string {
  return process.env.LEDGR_LOYVERSE_API_BASE ?? LOYVERSE_API_BASE;
}

/**
 * Thin client for the Loyverse REST API: bearer auth, cursor pagination, and a retry on
 * 429 / 5xx with backoff. The account limit is 300 requests per 300 s, so callers keep
 * pages large and fetch only what a pull needs.
 */
export class LoyverseClient {
  private readonly base: string;
  private readonly fetchImpl: typeof fetch;
  private readonly sleep: (ms: number) => Promise<void>;

  constructor(
    private readonly token: string,
    opts: LoyverseClientOptions = {},
  ) {
    this.base = (opts.baseUrl ?? loyverseBaseUrl()).replace(/\/+$/, '');
    this.fetchImpl = opts.fetchImpl ?? fetch;
    this.sleep = opts.sleep ?? ((ms) => new Promise((r) => setTimeout(r, ms)));
  }

  async get<T>(path: string, params: Record<string, string | number | undefined> = {}): Promise<T> {
    const url = new URL(`${this.base}/${path.replace(/^\/+/, '')}`);
    for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== '') url.searchParams.set(k, String(v));
    let lastErr: unknown;
    for (let attempt = 0; attempt < RETRIES; attempt++) {
      let res: Response;
      try {
        res = await this.fetchImpl(url, { headers: { Authorization: `Bearer ${this.token}`, Accept: 'application/json' } });
      } catch (e) {
        lastErr = e;
        await this.sleep(500 * 2 ** attempt);
        continue;
      }
      if (res.ok) return (await res.json()) as T;
      if (res.status === 429 || res.status >= 500) {
        lastErr = await this.toError(res);
        const retryAfter = Number(res.headers.get('retry-after'));
        await this.sleep(Number.isFinite(retryAfter) && retryAfter > 0 ? Math.min(retryAfter, 30) * 1000 : 500 * 2 ** attempt);
        continue;
      }
      throw await this.toError(res);
    }
    throw lastErr instanceof ApiException ? lastErr : new ApiException(HttpStatus.BAD_GATEWAY, 'LOYVERSE_UNREACHABLE', `Could not reach Loyverse: ${lastErr instanceof Error ? lastErr.message : 'network error'}`);
  }

  private async toError(res: Response): Promise<ApiException> {
    let detail = '';
    try {
      const body = (await res.json()) as { errors?: { code?: string; details?: string }[] };
      detail = (body.errors ?? []).map((e) => e.details ?? e.code).filter(Boolean).join('; ');
    } catch {
      /* no JSON body */
    }
    if (res.status === 401) return new ApiException(HttpStatus.BAD_REQUEST, 'LOYVERSE_UNAUTHORIZED', 'Loyverse rejected the access token. Create a new one in the Back Office and reconnect.');
    if (res.status === 402) return new ApiException(HttpStatus.BAD_REQUEST, 'LOYVERSE_SUBSCRIPTION', 'The Loyverse subscription for this account has lapsed.');
    if (res.status === 403) return new ApiException(HttpStatus.BAD_REQUEST, 'LOYVERSE_FORBIDDEN', `Loyverse refused the request${detail ? `: ${detail}` : ''}`);
    if (res.status === 429) return new ApiException(HttpStatus.TOO_MANY_REQUESTS, 'LOYVERSE_RATE_LIMITED', 'Loyverse rate limit hit (300 requests per 5 minutes). Try again shortly.');
    return new ApiException(HttpStatus.BAD_GATEWAY, 'LOYVERSE_ERROR', `Loyverse returned ${res.status}${detail ? `: ${detail}` : ''}`);
  }

  /** Walk a cursor-paginated list endpoint to the end. */
  async all<T>(path: string, key: string, params: Record<string, string | number | undefined> = {}, max = 10_000): Promise<T[]> {
    const out: T[] = [];
    let cursor: string | undefined;
    do {
      const page = await this.get<Record<string, unknown> & { cursor?: string }>(path, { ...params, limit: PAGE, cursor });
      const rows = (page[key] as T[] | undefined) ?? [];
      out.push(...rows);
      cursor = page.cursor || undefined;
      if (!rows.length) break;
    } while (cursor && out.length < max);
    return out;
  }

  merchant() {
    return this.get<LvMerchant>('merchant/');
  }
  stores() {
    return this.all<LvStore>('stores', 'stores');
  }
  paymentTypes() {
    return this.all<LvPaymentType>('payment_types', 'payment_types');
  }
  categories() {
    return this.all<LvCategory>('categories', 'categories');
  }
  items() {
    return this.all<LvItem>('items', 'items');
  }
  shifts(params: { store_ids?: string; limit?: number; created_at_min?: string } = {}) {
    return this.get<{ shifts: LvShift[]; cursor?: string }>('shifts', { ...params, limit: params.limit ?? 20 }).then((r) => r.shifts ?? []);
  }
  shift(id: string) {
    return this.get<LvShift>(`shifts/${encodeURIComponent(id)}`);
  }
  receipts(params: { store_id?: string; created_at_min: string; created_at_max: string }) {
    return this.all<LvReceipt>('receipts', 'receipts', params);
  }
}
