import express from "express";
import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { dashboardRouter } from "./routes/dashboard.routes.js";
import { errorHandler } from "./middleware/error-handler.js";

const currentDir = dirname(fileURLToPath(import.meta.url));
const distDir = resolve(currentDir, "../../dist");

export const app = express();

app.disable("x-powered-by");
app.use(express.json({ limit: "100kb" }));

app.get("/api/health", (request, response) => {
  response.json({ success: true, service: "storm-ops-dashboard-api", timestamp: new Date().toISOString() });
});

app.use("/api", dashboardRouter);

if (existsSync(distDir)) {
  app.use(express.static(distDir));
  app.use((request, response, next) => {
    if (request.method === "GET" && request.accepts("html")) return response.sendFile(resolve(distDir, "index.html"));
    return next();
  });
}

app.use(errorHandler);
