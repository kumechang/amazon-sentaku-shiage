import { readFileSync } from "node:fs";
import path from "node:path";

const ACCOUNT_INFO_PATH = path.resolve(process.cwd(), "config/account_info.md");

// config/account_info.md の内容をそのまま {{account_info}} として各プロンプトに渡す。
export function loadAccountInfo(): string {
  return readFileSync(ACCOUNT_INFO_PATH, "utf-8");
}
