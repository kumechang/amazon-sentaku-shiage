import type Database from "better-sqlite3";
import type { AppConfig } from "../config/types.js";
import { loadAccountInfo } from "../context/accountInfo.js";
import { selectProduct } from "../context/productSelector.js";
import { summarizeRecentPosts } from "../context/recentPostsSummarizer.js";
import { buildPostConditions } from "../context/postConditions.js";
import { runStrategyStage } from "../claude/stages/strategyStage.js";
import { runGenerateStage } from "../claude/stages/generateStage.js";
import { runSelfCheckStage } from "../claude/stages/selfCheckStage.js";
import { createPost, getPostById, setGithubIssue } from "../db/repositories/postsRepo.js";
import { createApprovalIssue } from "../github/createApprovalIssue.js";
import { finalizeApprovedPost } from "./finalizeApprovedPost.js";
import { logger } from "../lib/logger.js";
import { env } from "../lib/env.js";

// 投稿候補を1件作るパイプライン全体の統括役。
// コンテキスト構築 → 戦略決定 → 本文生成 → セルフチェック → DB保存 → 承認Issue作成、
// の順に実行し、最後にautoモードなら即時投稿まで行う。
export async function generateCandidate(db: Database.Database, config: AppConfig): Promise<number> {
  const accountInfo = loadAccountInfo();
  const { productId, productInfoText } = selectProduct(db);
  const recentPosts = summarizeRecentPosts(db, config.recentPostsWindow);
  const postConditions = buildPostConditions(db, config);

  logger.info("generating candidate", { productId });

  const strategyResult = await runStrategyStage(config.claudeModel, {
    accountInfo,
    productInfo: productInfoText,
    recentPosts,
    postConditions,
  });

  const generatedText = await runGenerateStage(config.claudeModel, {
    accountInfo,
    productInfo: productInfoText,
    strategy: strategyResult.data,
    recentPosts,
    platform: config.platform,
  });

  const selfCheckResult = await runSelfCheckStage(config.claudeModel, {
    generatedPost: generatedText,
    strategy: strategyResult.data,
    productInfo: productInfoText,
  });

  // pass true/falseに関わらず、常にselfCheckのfinal_postを投稿候補として採用する
  // (プロンプト自体が不合格時の修正を内包しているため)。
  const postId = createPost(db, {
    platform: config.platform,
    product_id: productId,
    post_type: strategyResult.data.post_type,
    product_usage: strategyResult.data.product_usage,
    strategy_json: JSON.stringify(strategyResult.data),
    generated_text: generatedText,
    selfcheck_json: JSON.stringify(selfCheckResult.data),
    final_text: selfCheckResult.data.final_post,
    self_check_score: selfCheckResult.data.score,
    self_check_pass: selfCheckResult.data.pass,
    run_id: env.githubRunId || null,
  });

  const issue = await createApprovalIssue({
    finalText: selfCheckResult.data.final_post,
    strategy: strategyResult.data,
    selfCheck: selfCheckResult.data,
  });
  if (issue.number > 0) {
    setGithubIssue(db, postId, issue.number, issue.url);
  }

  logger.info("candidate created", { postId, issueNumber: issue.number, score: selfCheckResult.data.score });

  // autoモードでも、セルフチェック不合格(pass=false)の場合は必ず人の承認待ちに倒す。
  // 自動投稿がセルフチェックをバイパスすることは無いようにする安全策。
  if (config.approvalMode === "auto" && selfCheckResult.data.pass) {
    const post = getPostById(db, postId);
    if (post) {
      await finalizeApprovedPost(db, config, post);
    }
  }

  return postId;
}
