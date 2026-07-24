import { createReadStream } from "node:fs";
import { rename, stat, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { extname, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = resolve(fileURLToPath(new URL("..", import.meta.url)));
const appRoot = resolve(projectRoot, "app");
const port = Number.parseInt(process.env.PORT || "5173", 10);
const host = "127.0.0.1";
const defaultCatalogPath = resolve(appRoot, "assets/config/default-catalog.json");
const defaultCatalogTemporaryPath = resolve(appRoot, "assets/config/.default-catalog.json.tmp");

const contentTypes = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".webp": "image/webp",
};

function sendJson(response, status, data) {
  response.writeHead(status, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" });
  response.end(JSON.stringify(data));
}

function readRequestJson(request) {
  return new Promise((resolveBody, rejectBody) => {
    let body = "";
    request.setEncoding("utf8");
    request.on("data", chunk => {
      body += chunk;
      if (body.length > 5_000_000) rejectBody(new Error("Catalogue trop volumineux"));
    });
    request.on("end", () => {
      try { resolveBody(JSON.parse(body)); }
      catch { rejectBody(new Error("JSON invalide")); }
    });
    request.on("error", rejectBody);
  });
}

function validCatalog(data) {
  if (data?.format !== "zombicide-catalog" || data.version !== 2 || !Array.isArray(data.tiles)) return false;
  return data.tiles.every(tile =>
    typeof tile?.id === "string" &&
    Array.isArray(tile.slots) &&
    tile.slots.every(slot =>
      typeof slot?.id === "string" &&
      typeof slot?.type === "string" &&
      Number.isFinite(slot.x) && slot.x >= 0 && slot.x <= 1 &&
      Number.isFinite(slot.y) && slot.y >= 0 && slot.y <= 1
    )
  );
}

const server = createServer(async (request, response) => {
  try {
    const url = new URL(request.url || "/", `http://${host}`);
    const pathname = decodeURIComponent(url.pathname);

    if (pathname === "/api/admin/catalog") {
      if (request.method !== "POST") {
        sendJson(response, 405, { error: "Méthode non autorisée" });
        return;
      }
      const data = await readRequestJson(request);
      if (!validCatalog(data)) {
        sendJson(response, 400, { error: "Format de catalogue invalide" });
        return;
      }
      await writeFile(defaultCatalogTemporaryPath, `${JSON.stringify(data, null, 2)}\n`, "utf8");
      await rename(defaultCatalogTemporaryPath, defaultCatalogPath);
      sendJson(response, 200, { ok: true, path: "app/assets/config/default-catalog.json", tiles: data.tiles.length });
      return;
    }

    const requestedPath = pathname === "/" ? "index.html" : pathname.slice(1);
    const servesDefaultCatalog = pathname === "/config/default-catalog.json";
    const staticRoot = appRoot;
    const filePath = servesDefaultCatalog ? defaultCatalogPath : resolve(staticRoot, requestedPath);

    if (filePath !== staticRoot && !filePath.startsWith(`${staticRoot}${sep}`)) {
      response.writeHead(403).end("Accès refusé");
      return;
    }

    const fileStat = await stat(filePath);
    if (!fileStat.isFile()) {
      throw new Error("Not a file");
    }

    response.writeHead(200, {
      "Content-Type": contentTypes[extname(filePath).toLowerCase()] || "application/octet-stream",
      "Cache-Control": "no-cache",
    });
    createReadStream(filePath).pipe(response);
  } catch (error) {
    if (request.url === "/api/admin/catalog") {
      sendJson(response, 500, { error: error.message || "Échec de la sauvegarde" });
      return;
    }
    response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    response.end("Fichier introuvable");
  }
});

server.listen(port, host, () => {
  console.log(`Forge de Quêtes disponible sur http://${host}:${port}`);
  console.log("Appuie sur Ctrl+C pour arrêter le serveur.");
});
