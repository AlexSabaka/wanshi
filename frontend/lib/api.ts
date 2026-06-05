export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message)
  }
}

async function parse<T>(res: Response): Promise<T> {
  const text = await res.text()
  const data = text ? JSON.parse(text) : null
  if (!res.ok) {
    const message =
      (data && (data.error as string)) || `Request failed (${res.status})`
    throw new ApiError(res.status, message)
  }
  return data as T
}

export async function apiGet<T>(path: string): Promise<T> {
  return parse<T>(await fetch(path, { cache: "no-store" }))
}

export async function apiPost<T>(path: string, body?: unknown): Promise<T> {
  return parse<T>(
    await fetch(path, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    })
  )
}
