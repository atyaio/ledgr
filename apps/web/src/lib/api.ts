import type { ApiError } from '@atyaio/ledgr-shared';

export class ApiRequestError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly details?: unknown,
  ) {
    super(message);
  }
}

let tokenGetter: () => Promise<string | null> | string | null = () => null;
let onUnauthorized: (() => void) | null = null;

export function configureApi(opts: { getToken: typeof tokenGetter; onUnauthorized?: () => void }) {
  tokenGetter = opts.getToken;
  onUnauthorized = opts.onUnauthorized ?? null;
}

export type Query = Record<string, string | number | boolean | null | undefined>;

export function qs(params?: Query): string {
  if (!params) return '';
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === null || v === '') continue;
    sp.set(k, String(v));
  }
  const s = sp.toString();
  return s ? `?${s}` : '';
}

async function request<T>(method: string, path: string, body?: unknown, init?: { raw?: boolean; form?: FormData }): Promise<T> {
  const token = await tokenGetter();
  const headers: Record<string, string> = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  let payload: BodyInit | undefined;
  if (init?.form) payload = init.form;
  else if (body !== undefined) {
    headers['Content-Type'] = 'application/json';
    payload = JSON.stringify(body);
  }
  const res = await fetch(`/api${path}`, { method, headers, body: payload });
  if (res.status === 401) onUnauthorized?.();
  if (!res.ok) {
    let err: Partial<ApiError> = {};
    try {
      err = (await res.json()) as ApiError;
    } catch {
      /* ignore */
    }
    throw new ApiRequestError(res.status, err.code ?? 'ERROR', err.message ?? res.statusText, err.details);
  }
  if (init?.raw) return (await res.text()) as unknown as T;
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

export const api = {
  get: <T>(path: string, params?: Query) => request<T>('GET', `${path}${qs(params)}`),
  post: <T>(path: string, body?: unknown) => request<T>('POST', path, body),
  patch: <T>(path: string, body?: unknown) => request<T>('PATCH', path, body),
  put: <T>(path: string, body?: unknown) => request<T>('PUT', path, body),
  delete: <T>(path: string, params?: Query) => request<T>('DELETE', `${path}${qs(params)}`),
  upload: <T>(path: string, form: FormData) => request<T>('POST', path, undefined, { form }),
  text: (path: string, params?: Query) => request<string>('GET', `${path}${qs(params)}`, undefined, { raw: true }),
};

/** Download a file through fetch so the bearer token is attached. */
export async function downloadFile(path: string, filename: string, params?: Query) {
  const token = await tokenGetter();
  const res = await fetch(`/api${path}${qs(params)}`, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
  if (!res.ok) throw new ApiRequestError(res.status, 'DOWNLOAD', `Download failed (${res.status})`);
  const blob = await res.blob();
  const cd = res.headers.get('content-disposition');
  const m = cd?.match(/filename="?([^";]+)"?/);
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = m?.[1] ?? filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}
