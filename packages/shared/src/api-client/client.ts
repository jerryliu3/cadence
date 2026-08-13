import { isAbortError } from "../async/abort";

const DEFAULT_API_TIMEOUT_MS = 15_000;

type HttpMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
type QueryValue = string | number | boolean | null | undefined;
type QueryParams = Record<string, QueryValue>;

export interface ApiErrorPayload {
  code?: string;
  message?: string;
  error?: string;
  correlationId?: string;
  details?: Record<string, unknown>;
}

interface ValidationIssueLike {
  path?: unknown;
  message?: unknown;
}

export interface RequestJsonOptions<TBody = unknown> {
  path: string;
  method?: HttpMethod;
  query?: URLSearchParams | QueryParams;
  body?: TBody;
  headers?: HeadersInit;
  cache?: RequestCache;
  credentials?: RequestCredentials;
  signal?: AbortSignal;
  timeoutMs?: number;
  fetcher?: typeof fetch;
  baseUrl?: string;
}

export type ApiClientTransportErrorReason = "timeout" | "network";

export class ApiClientError extends Error {
  readonly status: number;
  readonly code?: string;
  readonly correlationId?: string;
  readonly details?: Record<string, unknown>;
  readonly payload: unknown;

  constructor({
    status,
    message,
    payload,
  }: {
    status: number;
    message: string;
    payload: unknown;
  }) {
    super(message);
    this.name = "ApiClientError";
    this.status = status;
    this.payload = payload;
    if (isApiErrorPayload(payload)) {
      this.code = payload.code;
      this.correlationId = payload.correlationId;
      this.details = payload.details;
    }
  }
}

export class ApiClientTransportError extends Error {
  readonly reason: ApiClientTransportErrorReason;

  constructor(reason: ApiClientTransportErrorReason, cause: unknown) {
    super(
      reason === "timeout"
        ? "Request transport timed out."
        : "Request transport failed before reaching the server."
    );
    this.name = "ApiClientTransportError";
    this.reason = reason;
    (this as Error & { cause?: unknown }).cause = cause;
  }
}

function isApiErrorPayload(payload: unknown): payload is ApiErrorPayload {
  return payload !== null && typeof payload === "object";
}

function readApiErrorMessage(payload: unknown, fallback: string) {
  if (
    isApiErrorPayload(payload) &&
    typeof payload.message === "string" &&
    payload.message.trim().length > 0
  ) {
    return payload.message;
  }
  if (
    isApiErrorPayload(payload) &&
    typeof payload.error === "string" &&
    payload.error.trim().length > 0
  ) {
    return payload.error;
  }
  return fallback;
}

function readValidationIssueDetails(
  details: Record<string, unknown> | undefined
) {
  const issues = details?.issues;
  if (!Array.isArray(issues) || issues.length === 0) {
    return null;
  }
  const firstIssue = issues[0] as ValidationIssueLike;
  const issueMessage =
    typeof firstIssue?.message === "string" ? firstIssue.message.trim() : "";
  const issuePath = Array.isArray(firstIssue?.path)
    ? firstIssue.path
        .map((segment) => String(segment))
        .filter((segment) => segment.length > 0)
        .join(".")
    : "";
  if (!issueMessage) {
    return null;
  }
  if (!issuePath) {
    return issueMessage;
  }
  return `${issuePath}: ${issueMessage}`;
}

function toSearchParams(query: URLSearchParams | QueryParams | undefined) {
  if (!query) {
    return null;
  }
  if (query instanceof URLSearchParams) {
    return query;
  }
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value === undefined || value === null) {
      continue;
    }
    search.set(key, String(value));
  }
  return search;
}

function joinUrl(baseUrl: string | undefined, path: string) {
  if (!baseUrl) {
    return path;
  }
  if (/^https?:\/\//.test(path)) {
    return path;
  }
  const normalizedBase = baseUrl.replace(/\/+$/, "");
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  return `${normalizedBase}${normalizedPath}`;
}

function buildPath(
  path: string,
  query: URLSearchParams | QueryParams | undefined
) {
  const search = toSearchParams(query);
  if (!search || search.size === 0) {
    return path;
  }
  return `${path}?${search.toString()}`;
}

function createRequestSignal(signal: AbortSignal | undefined, timeoutMs: number) {
  const controller = new AbortController();
  const timeoutState = { hit: false };

  const timeoutId = setTimeout(() => {
    timeoutState.hit = true;
    controller.abort();
  }, timeoutMs);

  const forwardAbort = () => controller.abort();
  if (signal) {
    if (signal.aborted) {
      controller.abort();
    } else {
      signal.addEventListener("abort", forwardAbort, { once: true });
    }
  }

  return {
    signal: controller.signal,
    timeoutState,
    cleanup: () => {
      clearTimeout(timeoutId);
      if (signal) {
        signal.removeEventListener("abort", forwardAbort);
      }
    },
  };
}

async function parseJsonPayload(response: Response) {
  const text = await response.text();
  if (!text) {
    return null;
  }
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

export async function requestJson<TResponse, TBody = unknown>({
  path,
  method = "GET",
  query,
  body,
  headers,
  cache = "no-store",
  credentials = "same-origin",
  signal,
  timeoutMs = DEFAULT_API_TIMEOUT_MS,
  fetcher = fetch,
  baseUrl,
}: RequestJsonOptions<TBody>): Promise<TResponse> {
  const requestPath = joinUrl(baseUrl, buildPath(path, query));
  const timeout = createRequestSignal(signal, timeoutMs);

  const requestHeaders = new Headers(headers);
  const hasBody = body !== undefined;
  if (hasBody && !requestHeaders.has("Content-Type")) {
    requestHeaders.set("Content-Type", "application/json");
  }

  try {
    const response = await fetcher(requestPath, {
      method,
      headers: requestHeaders,
      cache,
      credentials,
      body: hasBody ? JSON.stringify(body) : undefined,
      signal: timeout.signal,
    });
    const payload = await parseJsonPayload(response);
    if (!response.ok) {
      throw new ApiClientError({
        status: response.status,
        message: readApiErrorMessage(
          payload,
          `Request failed with status ${response.status}.`
        ),
        payload,
      });
    }

    return payload as TResponse;
  } catch (error) {
    if (isAbortError(error) && timeout.timeoutState.hit) {
      throw new ApiClientTransportError("timeout", error);
    }
    if (isAbortError(error)) {
      throw error;
    }
    if (error instanceof ApiClientError) {
      throw error;
    }
    throw new ApiClientTransportError("network", error);
  } finally {
    timeout.cleanup();
  }
}

type SharedRequestOptions = Omit<
  RequestJsonOptions<never>,
  "path" | "method" | "body"
>;

export function getJson<TResponse>(
  path: string,
  options: SharedRequestOptions = {}
) {
  return requestJson<TResponse>({
    ...options,
    path,
    method: "GET",
  });
}

export function postJson<TResponse, TBody = unknown>(
  path: string,
  body: TBody,
  options: SharedRequestOptions = {}
) {
  return requestJson<TResponse, TBody>({
    ...options,
    path,
    method: "POST",
    body,
  });
}

export function putJson<TResponse, TBody = unknown>(
  path: string,
  body: TBody,
  options: SharedRequestOptions = {}
) {
  return requestJson<TResponse, TBody>({
    ...options,
    path,
    method: "PUT",
    body,
  });
}

export function isApiClientError(error: unknown): error is ApiClientError {
  return error instanceof ApiClientError;
}

export function isApiClientTransportError(
  error: unknown
): error is ApiClientTransportError {
  return error instanceof ApiClientTransportError;
}

export function getApiErrorMessage(error: unknown, fallback: string) {
  if (isApiClientError(error)) {
    if (error.code === "validation_failed") {
      const detailsMessage = readValidationIssueDetails(error.details);
      if (detailsMessage) {
        return `Request payload failed validation: ${detailsMessage}`;
      }
    }
    return error.message;
  }
  if (isApiClientTransportError(error)) {
    return fallback;
  }
  if (isAbortError(error)) {
    return fallback;
  }
  if (error instanceof Error && error.message.trim().length > 0) {
    return error.message;
  }
  return fallback;
}

export interface CreateApiClientOptions {
  baseUrl?: string;
  credentials?: RequestCredentials;
  fetcher?: typeof fetch;
  getAuthHeaders?: () => HeadersInit | Promise<HeadersInit>;
  onUnauthorized?: () => boolean | Promise<boolean>;
}

export function createApiClient({
  baseUrl,
  credentials = "omit",
  fetcher,
  getAuthHeaders,
  onUnauthorized,
}: CreateApiClientOptions = {}) {
  async function requestWithAuth<TResponse, TBody = unknown>(
    options: RequestJsonOptions<TBody>,
    didRetry = false
  ): Promise<TResponse> {
    const authHeaders = getAuthHeaders ? await getAuthHeaders() : undefined;
    const headers = new Headers(options.headers);
    if (authHeaders) {
      new Headers(authHeaders).forEach((value, key) => {
        headers.set(key, value);
      });
    }

    try {
      return await requestJson<TResponse, TBody>({
        ...options,
        baseUrl: options.baseUrl ?? baseUrl,
        credentials: options.credentials ?? credentials,
        fetcher: options.fetcher ?? fetcher,
        headers,
      });
    } catch (error) {
      if (
        !didRetry &&
        onUnauthorized &&
        isApiClientError(error) &&
        error.status === 401
      ) {
        const shouldRetry = await onUnauthorized();
        if (shouldRetry) {
          return requestWithAuth<TResponse, TBody>(options, true);
        }
      }
      throw error;
    }
  }

  return {
    requestJson: requestWithAuth,
    getJson<TResponse>(path: string, options: SharedRequestOptions = {}) {
      return requestWithAuth<TResponse>({
        ...options,
        path,
        method: "GET",
      });
    },
    postJson<TResponse, TBody = unknown>(
      path: string,
      body: TBody,
      options: SharedRequestOptions = {}
    ) {
      return requestWithAuth<TResponse, TBody>({
        ...options,
        path,
        method: "POST",
        body,
      });
    },
    putJson<TResponse, TBody = unknown>(
      path: string,
      body: TBody,
      options: SharedRequestOptions = {}
    ) {
      return requestWithAuth<TResponse, TBody>({
        ...options,
        path,
        method: "PUT",
        body,
      });
    },
  };
}
