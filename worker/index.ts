/** Cloudflare Worker entry point for the vinext-starter template. */
import {
  handleImageOptimization,
  DEFAULT_DEVICE_SIZES,
  DEFAULT_IMAGE_SIZES,
} from "vinext/server/image-optimization";
import handler from "vinext/server/app-router-entry";

interface Env {
  ASSETS: Fetcher;
  DB: D1Database;
  GOOGLE_SHEETS_WEBHOOK_URL: string;
  GOOGLE_SHEETS_SYNC_KEY: string;
  OPERATIONAL_RESET_ID?: string;
  IMAGES: {
    input(stream: ReadableStream): {
      transform(options: Record<string, unknown>): {
        output(options: {
          format: string;
          quality: number;
        }): Promise<{ response(): Response }>;
      };
    };
  };
}

interface ExecutionContext {
  waitUntil(promise: Promise<unknown>): void;
  passThroughOnException(): void;
}

// Image security config. SVG sources with .svg extension auto-skip the
// optimization endpoint on the client side (served directly, no proxy).
// To route SVGs through the optimizer (with security headers), set
// dangerouslyAllowSVG: true in next.config.js and uncomment below:
// const imageConfig: ImageConfig = { dangerouslyAllowSVG: true };

const worker = {
  async fetch(
    request: Request,
    env: Env,
    ctx: ExecutionContext,
  ): Promise<Response> {
    (globalThis as typeof globalThis & { __SITES_DB?: D1Database }).__SITES_DB =
      env.DB;
    const syncGlobals = globalThis as typeof globalThis & {
      __SHEETS_URL?: string;
      __SHEETS_KEY?: string;
    };
    syncGlobals.__SHEETS_URL = env.GOOGLE_SHEETS_WEBHOOK_URL;
    syncGlobals.__SHEETS_KEY = env.GOOGLE_SHEETS_SYNC_KEY;
    const url = new URL(request.url);

    if (env.OPERATIONAL_RESET_ID) {
      await env.DB.prepare(
        "CREATE TABLE IF NOT EXISTS system_flags (key TEXT PRIMARY KEY, value TEXT NOT NULL)",
      ).run();
      const completed = await env.DB.prepare(
        "SELECT value FROM system_flags WHERE key='operational_reset'",
      ).first<{ value: string }>();
      if (completed?.value !== env.OPERATIONAL_RESET_ID) {
        await env.DB.batch([
          env.DB.prepare(
            "CREATE TABLE IF NOT EXISTS inventory (id INTEGER PRIMARY KEY AUTOINCREMENT, code TEXT NOT NULL UNIQUE, name TEXT NOT NULL, brand TEXT NOT NULL, category TEXT NOT NULL, color TEXT NOT NULL DEFAULT '', quantity INTEGER NOT NULL DEFAULT 0, cost_price REAL NOT NULL, selling_price REAL NOT NULL, reorder_level INTEGER NOT NULL DEFAULT 3, created_at TEXT NOT NULL)",
          ),
          env.DB.prepare(
            "CREATE TABLE IF NOT EXISTS sales (id INTEGER PRIMARY KEY AUTOINCREMENT, item_id INTEGER NOT NULL, item_code TEXT NOT NULL, item_name TEXT NOT NULL, quantity INTEGER NOT NULL, unit_price REAL NOT NULL, total_amount REAL NOT NULL, created_at TEXT NOT NULL)",
          ),
          env.DB.prepare(
            "CREATE TABLE IF NOT EXISTS stock_activity (id INTEGER PRIMARY KEY AUTOINCREMENT, item_id INTEGER NOT NULL, item_code TEXT NOT NULL, item_name TEXT NOT NULL, type TEXT NOT NULL, change INTEGER NOT NULL, balance INTEGER NOT NULL, created_at TEXT NOT NULL)",
          ),
          env.DB.prepare(
            "CREATE TABLE IF NOT EXISTS audit_log (id INTEGER PRIMARY KEY AUTOINCREMENT, actor_email TEXT NOT NULL, action TEXT NOT NULL, entity_type TEXT NOT NULL, entity_code TEXT, description TEXT NOT NULL, source TEXT NOT NULL DEFAULT 'site', created_at TEXT NOT NULL)",
          ),
        ]);
        await env.DB.batch([
          env.DB.prepare("DELETE FROM inventory"),
          env.DB.prepare("DELETE FROM sales"),
          env.DB.prepare("DELETE FROM stock_activity"),
          env.DB.prepare("DELETE FROM audit_log"),
          env.DB.prepare(
            "INSERT INTO system_flags (key,value) VALUES ('operational_reset',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value",
          ).bind(env.OPERATIONAL_RESET_ID),
        ]);
      }
    }

    const publicPath =
      url.pathname.startsWith("/_") ||
      url.pathname === "/favicon.svg" ||
      url.pathname.startsWith("/signin-with-chatgpt") ||
      url.pathname.startsWith("/signout-with-chatgpt") ||
      url.pathname.startsWith("/callback");
    if (!publicPath) {
      await env.DB.batch([
        env.DB.prepare(
          "CREATE TABLE IF NOT EXISTS app_users (id INTEGER PRIMARY KEY AUTOINCREMENT, email TEXT NOT NULL UNIQUE, role TEXT NOT NULL DEFAULT 'staff', status TEXT NOT NULL DEFAULT 'active', invited_by TEXT, created_at TEXT NOT NULL)",
        ),
        env.DB.prepare(
          "INSERT OR IGNORE INTO app_users (email,role,status,invited_by,created_at) VALUES (?,?,?,?,?)",
        ).bind(
          "odeyjerry@gmail.com",
          "admin",
          "active",
          "system",
          new Date().toISOString(),
        ),
      ]);
      const email = request.headers
        .get("oai-authenticated-user-email")
        ?.toLowerCase();
      if (!email) {
        if (url.pathname.startsWith("/api/"))
          return Response.json(
            { error: "Authentication required" },
            { status: 401 },
          );
        return Response.redirect(
          new URL(
            `/signin-with-chatgpt?return_to=${encodeURIComponent(url.pathname + url.search)}`,
            request.url,
          ),
          302,
        );
      }
      const member = await env.DB.prepare(
        "SELECT email,role,status FROM app_users WHERE lower(email)=? AND status='active'",
      )
        .bind(email)
        .first<{ email: string; role: string; status: string }>();
      if (!member) {
        if (url.pathname.startsWith("/api/"))
          return Response.json(
            { error: "This email has not been invited" },
            { status: 403 },
          );
        return new Response(
          `<!doctype html><html><head><meta name="viewport" content="width=device-width"><title>Access pending · Genfrona</title><style>body{font-family:Arial;background:#f4f4ef;color:#17211d;display:grid;place-items:center;min-height:100vh;margin:0}.card{background:white;border:1px solid #e4e8e5;border-radius:18px;padding:36px;max-width:440px;text-align:center}.mark{width:52px;height:52px;border-radius:50%;background:#143f34;color:#d9f75f;display:grid;place-items:center;margin:auto;font-weight:bold;font-size:22px}h1{font-size:25px}p{color:#68736e;line-height:1.6}a{display:inline-block;margin-top:12px;color:#143f34}</style></head><body><main class="card"><div class="mark">G</div><h1>Access not granted</h1><p>${email} is signed in, but has not been invited to Genfrona Inventory. Ask a store administrator to add this email.</p><a href="/signout-with-chatgpt?return_to=/">Sign in with another account</a></main></body></html>`,
          {
            status: 403,
            headers: { "content-type": "text/html;charset=utf-8" },
          },
        );
      }
      const authHeaders = new Headers(request.headers);
      authHeaders.set("x-genfrona-email", member.email);
      authHeaders.set("x-genfrona-role", member.role);
      request = new Request(request, { headers: authHeaders });
    }

    if (url.pathname === "/_vinext/image") {
      const allowedWidths = [...DEFAULT_DEVICE_SIZES, ...DEFAULT_IMAGE_SIZES];
      return handleImageOptimization(
        request,
        {
          fetchAsset: (path) =>
            env.ASSETS.fetch(new Request(new URL(path, request.url))),
          transformImage: async (body, { width, format, quality }) => {
            const result = await env.IMAGES.input(body)
              .transform(width > 0 ? { width } : {})
              .output({ format, quality });
            return result.response();
          },
        },
        allowedWidths,
      );
    }

    return handler.fetch(request, env, ctx);
  },
};

export default worker;
