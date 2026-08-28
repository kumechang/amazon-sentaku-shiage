import { Octokit } from "@octokit/rest";
import { env } from "../lib/env.js";

let octokit: Octokit | undefined;

// Issue作成・コメント・クローズなど構造化されたGitHub操作はOctokit経由で行う
// (DBファイル自体のコミットはワークフローYAML内で素のgitコマンドを使う)。
export function getOctokit(): Octokit {
  if (octokit) return octokit;
  octokit = new Octokit({ auth: env.githubToken });
  return octokit;
}
