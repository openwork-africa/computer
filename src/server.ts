#!/usr/bin/env bun
// The page's API, and the page itself (web/dist), on 127.0.0.1 only. Each action on a computer is an entry in a table
// (Command), so the routes stay one line each and all go through the same checks.
import { resolve } from "node:path";
import { config } from "./config.ts";
import { Computer, services } from "./sdk.ts";

const json = (body: unknown, status = 200) => Response.json(body, { status, headers: { "cache-control": "no-store" } });
const bodyOf = async (req: Request): Promise<Record<string, string>> => (await req.json().catch(() => ({}))) ?? {};

// Only this server's own page may call it: another site open in the browser must not start or drive computers.
const allowed = (req: Request): boolean => {
  const host = req.headers.get("host") ?? "";
  if (!/^(127\.0\.0\.1|localhost)(:\d+)?$/.test(host)) return false;
  const origin = req.headers.get("origin");
  if (!origin) return true;
  const { hostname, port } = new URL(origin);
  return (hostname === "127.0.0.1" || hostname === "localhost") && (port === String(config.port) || port === "5173");
};

type Handler = (req: Request, params: Record<string, string>) => Promise<unknown>;
const route = (handler: Handler) => async (req: Request & { params?: Record<string, string> }) => {
  if (!allowed(req)) return json({ error: "Not allowed" }, 403);
  try {
    return json((await handler(req, req.params ?? {})) ?? { ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`${req.method} ${new URL(req.url).pathname}: ${message}`);
    return json({ error: message }, 500);
  }
};

const { computers, recordings } = services;

const COMPUTER_ACTIONS: Record<string, Handler> = {
  save: async (req, { id }) => computers.save(id, (await bodyOf(req)).label),
  resume: (_, { id }) => computers.resume(id),
  stream: async (_, { id }) => ({ id, stream: await computers.stream(id) }),
  stop: (_, { id }) => computers.remove(id),
  paste: async (req, { id }) => (await Computer.connect(id)).write((await bodyOf(req)).text ?? ""),
  copy: async (_, { id }) => ({ text: await (await Computer.connect(id)).copy() }),
};

const RECORDING_ACTIONS: Record<string, Handler> = {
  start: (_, { id }) => recordings.start(id),
  status: (_, { id }) => recordings.status(id),
  note: async (req, { id }) => recordings.note(id, (await bodyOf(req)).text ?? ""),
  finish: async (req, { id }) => recordings.finish(id, (await bodyOf(req)).name ?? ""),
  discard: (_, { id }) => recordings.discard(id),
};

const dispatch = (table: Record<string, Handler>): Handler => (req, params) => {
  const action = table[params.action];
  if (!action) throw new Error(`Unknown action: ${params.action}`);
  return action(req, params);
};

// The built page; any other path is the page too (it has one screen).
const page = async (req: Request) => {
  const path = resolve(config.webDir, `.${decodeURIComponent(new URL(req.url).pathname)}`);
  const file = Bun.file(path);
  if (path.startsWith(config.webDir) && path !== config.webDir.slice(0, -1) && (await file.exists())) return new Response(file);
  const index = Bun.file(config.webDir + "index.html");
  return (await index.exists()) ? new Response(index) : new Response("Build the page first: bun run build", { status: 503 });
};

if (import.meta.main) {
  const server = Bun.serve({
    hostname: config.host,
    port: config.port,
    routes: {
      "/api/computers": {
        GET: route(() => computers.list()),
        POST: route(async (req) => computers.create((await bodyOf(req)).label)),
      },
      "/api/computers/:id/recording/:action": { POST: route(dispatch(RECORDING_ACTIONS)) },
      "/api/computers/:id/:action": { POST: route(dispatch(COMPUTER_ACTIONS)) },
      "/api/recordings": { GET: route(() => recordings.list()) },
    },
    fetch: (req) => (allowed(req) ? page(req) : json({ error: "Not allowed" }, 403)),
  });
  console.log(`computer: ${server.url}`);
}
