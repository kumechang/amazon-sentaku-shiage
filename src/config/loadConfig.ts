import { readFileSync } from "node:fs";
import path from "node:path";
import type { AppConfig } from "./types.js";

const CONFIG_PATH = path.resolve(process.cwd(), "config/app.json");

let cached: AppConfig | undefined;

// config/app.json を読み込む。プロセス内で使い回すため一度読んだらキャッシュする。
export function loadConfig(): AppConfig {
  if (cached) return cached;
  const raw = readFileSync(CONFIG_PATH, "utf-8");
  cached = JSON.parse(raw) as AppConfig;
  return cached;
}
