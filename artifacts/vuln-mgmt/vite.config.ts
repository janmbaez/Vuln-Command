import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "path";
import fs from "fs";
import runtimeErrorOverlay from "@replit/vite-plugin-runtime-error-modal";
import type { Plugin, ViteDevServer, Connect } from "vite";

// ── File-store Vite plugin ─────────────────────────────────────────────────────
// Exposes three lightweight endpoints so the React app can persist data to
// actual files on disk in the workspace folder.  This survives Cowork session
// restarts because the workspace mount (/mnt/…) outlives the ephemeral
// /sessions/… temp directory where browser storage lives.
//
//   GET  /data/load        → returns vuln-data.json (or empty dataset)
//   POST /data/save        → writes JSON body to vuln-data.json
//   POST /data/log         → appends one JSONL line to sync-log.jsonl

function fileStorePlugin(): Plugin {
  // Workspace root — the folder mounted from the user's computer.
  // This path survives session restarts.
  const workspaceDir = path.resolve(import.meta.dirname, "../..");
  const dataFile     = path.join(workspaceDir, "vuln-data.json");
  const logFile      = path.join(workspaceDir, "sync-log.jsonl");

  function readBody(req: Connect.IncomingMessage): Promise<string> {
    return new Promise((resolve, reject) => {
      let buf = "";
      req.on("data", (chunk: Buffer) => { buf += chunk.toString(); });
      req.on("end",  () => resolve(buf));
      req.on("error", reject);
    });
  }

  return {
    name: "vuln-file-store",
    configureServer(server: ViteDevServer) {
      // ── Load ──────────────────────────────────────────────────────────────
      server.middlewares.use("/data/load", (_req, res, next) => {
        if ((_req as any).method !== "GET") { next(); return; }
        try {
          const content = fs.existsSync(dataFile)
            ? fs.readFileSync(dataFile, "utf-8")
            : JSON.stringify({ version: 1, vulnerabilities: [], source: "manual", savedAt: "" });
          res.setHeader("Content-Type", "application/json");
          res.end(content);
        } catch (e) {
          res.statusCode = 500;
          res.end(JSON.stringify({ error: String(e) }));
        }
      });

      // ── Save ──────────────────────────────────────────────────────────────
      server.middlewares.use("/data/save", async (req, res, next) => {
        if ((req as any).method !== "POST") { next(); return; }
        try {
          const body = await readBody(req);
          // Safety: reject payloads > 500 MB
          if (body.length > 500 * 1024 * 1024) {
            res.statusCode = 413;
            res.end(JSON.stringify({ error: "Payload too large" }));
            return;
          }
          fs.writeFileSync(dataFile, body, "utf-8");
          res.setHeader("Content-Type", "application/json");
          res.end(JSON.stringify({ ok: true, bytes: body.length }));
        } catch (e) {
          res.statusCode = 500;
          res.end(JSON.stringify({ error: String(e) }));
        }
      });

      // ── Log ───────────────────────────────────────────────────────────────
      server.middlewares.use("/data/log", async (req, res, next) => {
        if ((req as any).method !== "POST") { next(); return; }
        try {
          const body = await readBody(req);
          // Validate: must be a single JSON object
          JSON.parse(body);
          fs.appendFileSync(logFile, body + "\n", "utf-8");
          res.setHeader("Content-Type", "application/json");
          res.end(JSON.stringify({ ok: true }));
        } catch (e) {
          res.statusCode = 500;
          res.end(JSON.stringify({ error: String(e) }));
        }
      });
    },
  };
}

const rawPort = process.env.PORT ?? "5173";
const port = Number(rawPort);
const basePath = process.env.BASE_PATH ?? "/";

export default defineConfig({
  base: basePath,
  plugins: [
    react(),
    tailwindcss(),
    runtimeErrorOverlay(),
    fileStorePlugin(),
    ...(process.env.NODE_ENV !== "production" &&
    process.env.REPL_ID !== undefined
      ? [
          await import("@replit/vite-plugin-cartographer").then((m) =>
            m.cartographer({
              root: path.resolve(import.meta.dirname, ".."),
            }),
          ),
          await import("@replit/vite-plugin-dev-banner").then((m) =>
            m.devBanner(),
          ),
        ]
      : []),
  ],
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "src"),
      "@assets": path.resolve(import.meta.dirname, "..", "..", "attached_assets"),
    },
    dedupe: ["react", "react-dom"],
  },
  root: path.resolve(import.meta.dirname),
  build: {
    outDir: path.resolve(import.meta.dirname, "dist/public"),
    emptyOutDir: true,
  },
  server: {
    port,
    host: "0.0.0.0",
    allowedHosts: true,
    fs: {
      strict: true,
      deny: ["**/.*"],
    },
    proxy: {
      // Proxy CrowdStrike API calls to avoid CORS issues in the browser.
      // All requests to /cs-api/* are forwarded to api.us-2.crowdstrike.com/*.
      "/cs-api": {
        target: "https://api.us-2.crowdstrike.com",
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/cs-api/, ""),
        secure: true,
      },
    },
  },
  preview: {
    port,
    host: "0.0.0.0",
    allowedHosts: true,
  },
});
