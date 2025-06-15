
import { z } from "zod";

export const RestaurantCriteriaSchema = z.object({
  date: z.date({
    required_error: "日付を選択してください。",
    invalid_type_error: "有効な日付を選択してください。",
  }),
  time: z.string().min(1, "時間を選択してください。"),
  budget: z.string().min(1, "予算を入力してください。"),
  cuisine: z.string().min(1, "料理の種類を入力してください。"),
  location: z.string().min(1, "場所を入力してください。"),
});

export type RestaurantCriteria = z.infer<typeof RestaurantCriteriaSchema>;

export const AnalyzeRestaurantReviewsOutputSchema = z.object({
  overallSentiment: z
    .string()
    .describe('レストランに対する全体的な感情（例：高評価、賛否両論、不評など）。日本語で記述してください。'),
  keyAspects:
    z.object({
      food: z
        .string()
        .describe('料理に関する感情と具体的な言及（例：「ピザが特に好評」「値段の割に味は普通」など）。日本語で記述してください。'),
      service:
        z.string().describe('サービスに関する感情と具体的な言及（例：「店員の対応が丁寧」「提供が遅い」など）。日本語で記述してください。'),
      ambiance: z
        .string()
        .describe('雰囲気に関する感情と具体的な言及（例：「個室があり落ち着ける」「店内は活気がある」など）。日本語で記述してください。'),
    })
    .describe('レストランの主要な側面とその感情。'),
  groupDiningExperience:
    z
      .string()
      .describe(
        'グループでの食事体験、グループ利用への適性に関する言及（例：「大人数での予約がしやすい」「宴会には不向き」など）。日本語で記述してください。'
      ),
});
export type AnalyzeRestaurantReviewsOutput = z.infer<
  typeof AnalyzeRestaurantReviewsOutputSchema
>;

export const SuggestRestaurantsOutputSchema = z.object({
  restaurantName: z.string().describe('おすすめのレストラン名。日本語で記述してください。'),
  recommendationRationale: z.string().describe('分析されたレビューと基準に基づいてレストランをおすすめする理由の詳細な説明（日本語で記述）。'),
});
export type SuggestRestaurantsOutput = z.infer<typeof SuggestRestaurantsOutputSchema>;
