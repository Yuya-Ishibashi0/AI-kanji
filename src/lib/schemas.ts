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
