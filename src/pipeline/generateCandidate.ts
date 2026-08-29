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
import { getWeightedLength } from "../lib/tweetLength.js";
import type { Strategy } from "../claude/stages/strategyStage.js";
import type { SelfCheckResult } from "../claude/stages/selfCheckStage.js";

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

  const generateAndCheck = () =>
    runGenerateAndSelfCheck(config, {
      accountInfo,
      productInfo: productInfoText,
      strategy: strategyResult.data,
      recentPosts,
    });

  let { generatedText, selfCheckResult } = await generateAndCheck();

  // 文字数超過は投稿時にエラーになり、せっかく承認してもらっても投稿できず終わってしまう。
  // Issueを作る前に検知し、1回だけ生成をやり直す(それでも超過なら失敗させ、
  // 文字数超過のまま承認待ちの候補が残らないようにする)。
  if (getWeightedLength(selfCheckResult.data.final_post) > config.xCharLimit) {
    logger.warn("final post exceeds char limit, retrying generate+selfcheck once", {
      length: getWeightedLength(selfCheckResult.data.final_post),
    });
    ({ generatedText, selfCheckResult } = await generateAndCheck());

    const retryLength = getWeightedLength(selfCheckResult.data.final_post);
    if (retryLength > config.xCharLimit) {
      throw new Error(`generated post exceeds char limit after retry: ${retryLength} > ${config.xCharLimit}`);
    }
  }

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

interface GenerateAndCheckContext {
  accountInfo: string;
  productInfo: string;
  strategy: Strategy;
  recentPosts: string;
}

// 投稿生成→セルフチェックの2ステージをまとめて実行する。
// 文字数超過時のリトライで同じ組み合わせをもう一度呼ぶために切り出している。
async function runGenerateAndSelfCheck(
  config: AppConfig,
  ctx: GenerateAndCheckContext
): Promise<{ generatedText: string; selfCheckResult: { raw: string; data: SelfCheckResult } }> {
  const generatedText = await runGenerateStage(config.claudeModel, {
    accountInfo: ctx.accountInfo,
    productInfo: ctx.productInfo,
    strategy: ctx.strategy,
    recentPosts: ctx.recentPosts,
    platform: config.platform,
    charLimit: config.xCharLimit,
  });

  const selfCheckResult = await runSelfCheckStage(config.claudeModel, {
    generatedPost: generatedText,
    strategy: ctx.strategy,
    productInfo: ctx.productInfo,
  });

  return { generatedText, selfCheckResult };
}
