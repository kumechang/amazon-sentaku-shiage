// config/app.json の型定義。
export interface AppConfig {
  approvalMode: "manual" | "auto";
  claudeModel: string;
  selfCheckPassThreshold: number;
  platform: string;
  xCharLimit: number;
  targetProductRatio: {
    review: number;
    sale: number;
  };
  recentPostsWindow: number;
}
