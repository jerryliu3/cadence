const DEFAULT_API_TIMEOUT_MS = 15_000;

type HttpMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
type QueryValue = string | number | boolean | null | undefined;
type QueryParams = Record<string, QueryValue>;

export interface ApiErrorPayload {
  code?: string;
  message?: string;
  correlationId?: string;
  details?: Record<string, unknown>;
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
}

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

function isAbortError(error: unknown) {
  return error instanceof Error && error.name === "AbortError";
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
  return fallback;
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

function buildPath(path: string, query: URLSearchParams | QueryParams | undefined) {
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
}: RequestJsonOptions<TBody>): Promise<TResponse> {
  const requestPath = buildPath(path, query);
  const timeout = createRequestSignal(signal, timeoutMs);

  const requestHeaders = new Headers(headers);
  const hasBody = body !== undefined;
  if (hasBody && !requestHeaders.has("Content-Type")) {
    requestHeaders.set("Content-Type", "application/json");
  }

  let response: Response;
  try {
    response = await fetch(requestPath, {
      method,
      headers: requestHeaders,
      cache,
      credentials,
      body: hasBody ? JSON.stringify(body) : undefined,
      signal: timeout.signal,
    });
  } catch (error) {
    if (isAbortError(error)) {
      if (timeout.timeoutState.hit) {
        throw new Error(`Request timed out after ${timeoutMs}ms.`);
      }
      throw new Error("Request was canceled.");
    }
    throw new Error("Request failed before the server could respond.");
  } finally {
    timeout.cleanup();
  }

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

export function getApiErrorMessage(error: unknown, fallback: string) {
  if (isApiClientError(error)) {
    return error.message;
  }
  if (error instanceof Error && error.message.trim().length > 0) {
    return error.message;
  }
  return fallback;
}
