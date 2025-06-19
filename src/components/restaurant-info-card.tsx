
"use client";

import type { AnalyzeRestaurantReviewsOutput } from "@/ai/flows/analyze-restaurant-reviews";
import type { SuggestRestaurantsOutput } from "@/ai/flows/suggest-restaurants";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import { BadgeCheck, CalendarClock, MessageSquareQuote, Sparkles, Star, ThumbsDown, ThumbsUp, Users, LinkIcon, MapIcon, Home, Tag, TrendingUp, CircleDollarSign } from "lucide-react";
import Image from 'next/image';
import { useState } from "react";
import { Badge } from "@/components/ui/badge";

interface RestaurantInfoCardProps {
  suggestion: SuggestRestaurantsOutput; // Should only contain restaurantName and recommendationRationale
  analysis: AnalyzeRestaurantReviewsOutput;
  photoUrl?: string;
  websiteUri?: string;
  googleMapsUri?: string;
  address?: string;
  rating?: number;
  userRatingsTotal?: number;
  types?: string[];
  priceLevel?: string;
}

// Helper function to convert price level to a more readable format
const formatPriceLevel = (priceLevel?: string): string => {
  if (!priceLevel) return "情報なし";
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
      return "情報なし";
  }
};

export default function RestaurantInfoCard({ 
  suggestion, 
  analysis, 
  photoUrl, 
  websiteUri, 
  googleMapsUri,
  address,
  rating,
  userRatingsTotal,
  types,
  priceLevel 
}: RestaurantInfoCardProps) {
  const { toast } = useToast();
  const [availabilityStatus, setAvailabilityStatus] = useState<string | null>(null);
  const [bookingStatus, setBookingStatus] = useState<string | null>(null);
  const [isBooking, setIsBooking] = useState(false);
  
  const handleCheckAvailability = () => {
    setAvailabilityStatus("空席を確認中...");
    setTimeout(() => {
      const isAvailable = Math.random() > 0.3; 
      if (isAvailable) {
        setAvailabilityStatus("空席あり！予約に進めます。");
        toast({ title: "空席情報", description: "空席が見つかりました！" });
      } else {
        setAvailabilityStatus("申し訳ありません、満席です。");
        toast({ title: "空席情報", description: "満席のようです。", variant: "destructive" });
      }
    }, 1500);
  };

  const handleBookNow = () => {
    setIsBooking(true);
    setBookingStatus("予約処理中...");
    toast({ title: "予約処理", description: "予約手続きを開始しました..." });
    setTimeout(() => {
      const isBooked = Math.random() > 0.2; 
      if (isBooked) {
        const reservationId = `AI-${Math.random().toString(36).substring(2, 8).toUpperCase()}`;
        setBookingStatus(`予約完了！ 予約ID: ${reservationId}`);
        toast({ title: "予約成功", description: `予約が完了しました。予約ID: ${reservationId}`, variant: "default" });
      } else {
        setBookingStatus("予約に失敗しました。再度お試しください。");
        toast({ title: "予約失敗", description: "予約処理中にエラーが発生しました。", variant: "destructive" });
      }
      setIsBooking(false);
    }, 2500);
  };

  const getSentimentIcon = (sentiment: string) => {
    if (sentiment.toLowerCase().includes("positive") || sentiment.toLowerCase().includes("良い") || sentiment.toLowerCase().includes("好評")) return <ThumbsUp className="h-5 w-5 text-green-500" />;
    if (sentiment.toLowerCase().includes("negative") || sentiment.toLowerCase().includes("悪い") || sentiment.toLowerCase().includes("不評")) return <ThumbsDown className="h-5 w-5 text-red-500" />;
    return <Star className="h-5 w-5 text-yellow-500" />;
  }

  const KanjiChecklistItem = ({ label, value }: { label: string; value?: string }) => (
    <div className="flex items-start">
      <dt className="font-semibold w-28 shrink-0">{label}:</dt>
      <dd className="text-muted-foreground">
        {value && value.trim() !== "情報なし" ? value : <span className="italic">情報なし</span>}
      </dd>
    </div>
  );


  return (
    <Card className="shadow-lg w-full overflow-hidden">
      <CardHeader className="pb-4">
        <CardTitle className="text-2xl font-headline text-primary flex items-center">
          <Sparkles className="mr-2 h-7 w-7 text-accent" />
          おすすめのレストラン
        </CardTitle>
        <CardDescription className="font-bold text-xl text-foreground">{suggestion.restaurantName}</CardDescription>
      </CardHeader>
      
      <CardContent className="space-y-6">
        <div className="aspect-video bg-muted rounded-md overflow-hidden relative">
          {photoUrl ? (
             <Image 
              src={photoUrl}
              alt={suggestion.restaurantName} 
              fill
              style={{ objectFit: 'cover' }}
              priority
            />
          ) : (
            <Image 
              src="https://placehold.co/600x400.png" 
              alt={suggestion.restaurantName + " placeholder image"}
              fill
              style={{ objectFit: 'cover' }}
              data-ai-hint="restaurant food"
            />
          )}
        </div>

        <div className="space-y-2 text-sm">
          {address && (
            <div className="flex items-center">
              <Home className="mr-2 h-4 w-4 text-muted-foreground" />
              <span>{address}</span>
            </div>
          )}
          <div className="flex flex-wrap gap-x-4 gap-y-1">
            {rating !== undefined && userRatingsTotal !== undefined && (
              <div className="flex items-center">
                <TrendingUp className="mr-1.5 h-4 w-4 text-muted-foreground" />
                <span>評価: {rating.toFixed(1)} ({userRatingsTotal}件)</span>
              </div>
            )}
            {priceLevel && (
              <div className="flex items-center">
                <CircleDollarSign className="mr-1.5 h-4 w-4 text-muted-foreground" />
                <span>価格帯: {formatPriceLevel(priceLevel)}</span>
              </div>
            )}
          </div>
          {types && types.length > 0 && (
            <div className="flex items-center flex-wrap gap-1 pt-1">
              <Tag className="mr-1.5 h-4 w-4 text-muted-foreground" />
              {types.map((type) => (
                <Badge key={type} variant="secondary" className="text-xs">{type}</Badge>
              ))}
            </div>
          )}
        </div>


        {(websiteUri || googleMapsUri) && (
          <div className="flex flex-wrap gap-2">
            {websiteUri && (
              <Button variant="outline" size="sm" asChild>
                <a href={websiteUri} target="_blank" rel="noopener noreferrer">
                  <LinkIcon className="mr-2 h-4 w-4" />
                  公式サイト
                </a>
              </Button>
            )}
            {googleMapsUri && (
              <Button variant="outline" size="sm" asChild>
                <a href={googleMapsUri} target="_blank" rel="noopener noreferrer">
                  <MapIcon className="mr-2 h-4 w-4" />
                  Google Maps
                </a>
              </Button>
            )}
          </div>
        )}

        <Separator />

        <div>
          <h3 className="text-lg font-semibold mb-2 flex items-center font-headline">
            <MessageSquareQuote className="mr-2 h-5 w-5 text-primary" />
            AIによるレビュー分析
          </h3>
          <div className="space-y-2 text-sm bg-secondary/50 p-4 rounded-md">
            <p className="flex items-center"><strong>総合評価:</strong>&nbsp;{getSentimentIcon(analysis.overallSentiment)}&nbsp;{analysis.overallSentiment}</p>
            <p><strong>料理:</strong>&nbsp;{analysis.keyAspects.food}</p>
            <p><strong>サービス:</strong>&nbsp;{analysis.keyAspects.service}</p>
            <p><strong>雰囲気:</strong>&nbsp;{analysis.keyAspects.ambiance}</p>
            <p className="flex items-center"><Users className="mr-1.5 h-4 w-4 text-primary"/><strong>グループ利用:</strong>&nbsp;{analysis.groupDiningExperience}</p>
          </div>
        </div>

        {analysis.kanjiChecklist && (
            <div>
                <h3 className="text-lg font-semibold mb-2 mt-4 flex items-center font-headline">
                    <BadgeCheck className="mr-2 h-5 w-5 text-primary" />
                    幹事さん向けチェックポイント
                </h3>
                <dl className="space-y-1 text-sm bg-blue-50 dark:bg-blue-900/30 p-4 rounded-md">
                    <KanjiChecklistItem label="個室の質" value={analysis.kanjiChecklist.privateRoomQuality} />
                    <KanjiChecklistItem label="店内の静かさ" value={analysis.kanjiChecklist.noiseLevel} />
                    <KanjiChecklistItem label="団体サービス" value={analysis.kanjiChecklist.groupService} />
                </dl>
            </div>
        )}
        
        <div>
          <h3 className="text-lg font-semibold mb-2 mt-4 flex items-center font-headline">
            <Sparkles className="mr-2 h-5 w-5 text-accent" />
            おすすめ理由
          </h3>
          <p className="text-sm bg-accent/10 p-4 rounded-md text-foreground">{suggestion.recommendationRationale}</p>
        </div>

        <Separator />

        <div>
          <h3 className="text-lg font-semibold mb-3 flex items-center font-headline">
            <CalendarClock className="mr-2 h-5 w-5 text-primary" />
            予約アシスタンス (モック)
          </h3>
          <div className="space-y-3">
            <Button onClick={handleCheckAvailability} disabled={isBooking} className="w-full sm:w-auto">
              空席を確認する
            </Button>
            {availabilityStatus && <p className="text-sm p-2 bg-muted rounded-md">{availabilityStatus}</p>}
            
            {availabilityStatus?.includes("空席あり") && (
              <>
                <Button onClick={handleBookNow} disabled={isBooking} className="w-full sm:w-auto">
                  {isBooking ? "予約処理中..." : "この内容で予約する"}
                </Button>
                {bookingStatus && <p className={`text-sm p-2 rounded-md ${bookingStatus.includes("完了") ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>{bookingStatus}</p>}
              </>
            )}
          </div>
        </div>
      </CardContent>
      <CardFooter>
         <p className="text-xs text-muted-foreground">※予約機能はデモ用です。実際の予約は行われません。</p>
      </CardFooter>
    </Card>
  );
}

    