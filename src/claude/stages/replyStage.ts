import { z } from "zod";
import { loadPromptTemplate, renderPrompt } from "../promptLoader.js";
import { callClaudeJson } from "../jsonRetry.js";

// 返信生成.md の出力JSON形式。
export const replySchema = z.object({
  should_reply: z.boolean(),
  reply_text: z.string(),
  reason: z.string(),
});

export type ReplyResult = z.infer<typeof replySchema>;

export interface ReplyStageInput {
  accountInfo: string;
  targetAuthor: string;
  targetText: string;
  recentPosts: string;
  rejectionFeedback: string;
}

// 相手の投稿1件に対して、返信すべきかどうか・返信するなら何を書くかをClaudeに判断させる。
export async function runReplyStage(model: string, input: ReplyStageInput): Promise<{ raw: string; data: ReplyResult }> {
  const template = loadPromptTemplate("返信生成.md");
  const prompt = renderPrompt(template, {
    account_info: input.accountInfo,
    target_author: input.targetAuthor,
    target_text: input.targetText,
    recent_posts: input.recentPosts,
    rejection_feedback: input.rejectionFeedback,
  });
  return callClaudeJson(model, prompt, replySchema);
}
