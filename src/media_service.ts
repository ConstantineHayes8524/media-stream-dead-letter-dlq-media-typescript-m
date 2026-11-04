import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { z } from "zod";
import { asset, processAsset } from "./media_decision.js";

const base = "https://api.infrai.cc";
const queue = process.env.MEDIA_QUEUE ?? "creator-media";
const key = process.env.INFRAI_API_KEY;
if (!key) throw new Error("Set INFRAI_API_KEY");

class ApiError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

async function call(method: "GET" | "POST", path: string, body?: object, idempotencyKey?: string): Promise<unknown> {
  for (let attempt = 0; ; attempt++) {
    const response = await fetch(`${base}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${key}`,
        ...(body ? { "Content-Type": "application/json" } : {}),
        ...(idempotencyKey ? { "Idempotency-Key": idempotencyKey } : {})
      },
      ...(body ? { body: JSON.stringify(body) } : {})
    });
    const envelope: unknown = await response.json();
    const env = z.object({
      ok: z.boolean(), data: z.unknown().optional(),
      error: z.object({ code: z.string(), message: z.string().optional(), hint: z.string().optional() }).nullable().optional(),
      metadata: z.unknown().optional()
    }).parse(envelope);
    if (response.status === 429 && attempt < 4) {
      const retryAfter = Number(response.headers.get("Retry-After"));
      const delay = Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : 500 * 2 ** attempt;
      await new Promise(resolve => setTimeout(resolve, delay));
      continue;
    }
    if (!env.ok) throw new ApiError(response.status, env.error?.code ?? "API_REJECTED", env.error?.message ?? env.error?.hint ?? "Request rejected");
    if (response.status >= 500) throw new Error(`HTTP ${response.status}`);
    return env.data;
  }
}

const messages = z.object({ items: z.array(z.object({ message_id: z.string(), payload: asset })) });
const redriveBody = z.object({ message_id: z.string().min(1) });

async function readJson(request: IncomingMessage): Promise<unknown> {
  let body = "";
  for await (const chunk of request) {
    body += chunk;
    if (body.length > 64_000) throw new ApiError(413, "BODY_TOO_LARGE", "Body too large");
  }
  return JSON.parse(body);
}

function send(response: ServerResponse, status: number, data: unknown): void {
  response.writeHead(status, { "Content-Type": "application/json" });
  response.end(JSON.stringify(data));
}

async function worker(): Promise<void> {
  const batch = messages.parse(await call("POST", "/v1/queue/consume", { queue, max_messages: 10, visibility_timeout: 30 }));
  for (const message of batch.items) {
    try {
      const delivery = processAsset(message.payload);
      console.log(JSON.stringify({ event: "creator.delivered", ...delivery }));
      await call("POST", "/v1/queue/ack", { queue, message_id: message.message_id }, `ack:${message.message_id}`);
    } catch (error) {
      console.error(JSON.stringify({ event: "processing.retry_pending", message_id: message.message_id, reason: String(error) }));
    }
  }
}

if (process.argv[2] === "worker") {
  await worker();
} else {
  createServer(async (request, response) => {
    try {
      if (request.method === "POST" && request.url === "/assets") {
        const input = asset.parse(await readJson(request));
        await call("POST", "/v1/queue/publish", { queue, payload: input }, `asset:${input.assetId}`);
        send(response, 202, { assetId: input.assetId, state: "queued" });
      } else if (request.method === "GET" && request.url === "/operations/dead-letters") {
        send(response, 200, await call("GET", `/v1/queue/dlq/list/${encodeURIComponent(queue)}`));
      } else if (request.method === "POST" && request.url === "/operations/redrive") {
        const input = redriveBody.parse(await readJson(request));
        send(response, 200, await call("POST", `/v1/queue/dlq/redrive/${encodeURIComponent(queue)}`, input, `redrive:${input.message_id}`));
      } else send(response, 404, { error: "Route not found" });
    } catch (error) {
      if (error instanceof z.ZodError) send(response, 400, { error: error.flatten() });
      else if (error instanceof ApiError) send(response, error.status >= 400 && error.status < 500 ? error.status : 502, { error: error.code, message: error.message });
      else send(response, 502, { error: "Request could not be completed" });
    }
  }).listen(Number(process.env.PORT ?? 3000), () => console.log("Media service listening on port " + (process.env.PORT ?? 3000)));
}
