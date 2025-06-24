import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export const formatPriceLevel = (priceLevel?: string): string => {
  if (!priceLevel) return "";
  switch (priceLevel) {
    case "PRICE_LEVEL_FREE":
      return "無料";
    case "PRICE_LEVEL_INEXPENSIVE":
      return "¥";
    case "PRICE_LEVEL_MODERATE":
      return "¥¥";
    case "PRICE_LEVEL_EXPENSIVE":
      return "¥¥¥";
    case "PRICE_LEVEL_VERY_EXPENSIVE":
      return "¥¥¥¥";
    default:
      return "";
  }
};
