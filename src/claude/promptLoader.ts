import { readFileSync } from "node:fs";
import path from "node:path";

const PROMPT_DIR = path.resolve(process.cwd(), "prompt");

// prompt/*.md (マーケティング検討済みの既存プロンプト、中身は変更しない)を読み込む。
export function loadPromptTemplate(fileName: string): string {
  return readFileSync(path.join(PROMPT_DIR, fileName), "utf-8");
}

// テンプレート中の {{key}} をvariablesの値で置換する。
// 未指定のプレースホルダがあれば、不完全なプロンプトをClaudeに送る前に気付けるよう例外を投げる。
export function renderPrompt(template: string, variables: Record<string, string>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (match, key: string) => {
    if (!(key in variables)) {
      throw new Error(`prompt variable not provided: ${key}`);
    }
    return variables[key] ?? "";
  });
}
