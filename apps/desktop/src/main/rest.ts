import {
  ApiErrorBodySchema,
  buildPath,
  endpoints,
  type AppErrorCode,
  type EndpointResponse,
  type EndpointRequestBody,
} from '@croc-classroom/shared';

export class ClientError extends Error {
  constructor(
    readonly code: AppErrorCode,
    message: string,
  ) {
    super(message);
  }
}
export function publicError(error: unknown) {
  if (error instanceof ClientError) return { code: error.code, message: error.message };
  return { code: 'INTERNAL' as const, message: 'Không thể hoàn thành thao tác.' };
}
export function serverOrigin(value: string) {
  const url = new URL(value);
  const local = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
  if (
    !(url.protocol === 'https:' || (local && url.protocol === 'http:')) ||
    url.username ||
    url.password ||
    url.pathname !== '/' ||
    url.search ||
    url.hash
  )
    throw new ClientError('INVALID_INPUT', 'Địa chỉ máy chủ không hợp lệ.');
  return url.origin;
}
type Endpoints = typeof endpoints;
export class RestClient {
  constructor(
    readonly origin: string,
    readonly token = '',
    readonly signal?: AbortSignal,
    readonly expired?: (reason: 'revoked' | 'expired') => void,
  ) {}
  async call<K extends keyof Endpoints>(
    key: K,
    id?: string,
    input?: EndpointRequestBody<Endpoints[K]>,
  ): Promise<EndpointResponse<Endpoints[K]>> {
    const endpoint = endpoints[key];
    const body = endpoint.body?.parse(input);
    const headers = new Headers();
    if (this.token) headers.set('Authorization', 'Bearer ' + this.token);
    if (body !== undefined) headers.set('Content-Type', 'application/json');
    const timeout = AbortSignal.timeout(20000);
    const response = await fetch(this.origin + buildPath(endpoint.path, id ? { id } : {}), {
      method: endpoint.method,
      headers,
      redirect: 'error',
      body: JSON.stringify(body),
      signal: this.signal ? AbortSignal.any([this.signal, timeout]) : timeout,
    }).catch(() => {
      throw new ClientError('OFFLINE', 'Không kết nối được máy chủ.');
    });
    if (!response.ok) {
      const parsed = ApiErrorBodySchema.safeParse(await response.json().catch(() => null));
      if (parsed.success && this.token) {
        if (parsed.data.error.code === 'UNAUTHENTICATED') this.expired?.('expired');
        if (parsed.data.error.code === 'ACCOUNT_DISABLED') this.expired?.('revoked');
      }
      throw new ClientError(
        parsed.success ? parsed.data.error.code : 'INTERNAL',
        parsed.success ? parsed.data.error.message : 'Máy chủ trả lỗi.',
      );
    }
    if (response.status !== endpoint.successStatus)
      throw new ClientError('INTERNAL', 'Phản hồi không đúng hợp đồng.');
    return endpoint.response?.parse(await response.json()) as EndpointResponse<Endpoints[K]>;
  }
}
