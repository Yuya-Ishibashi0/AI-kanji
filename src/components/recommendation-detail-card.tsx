
"use client";

import type { RecommendationResult } from "@/lib/schemas";
import Image from 'next/image';
import { Card, CardContent, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Award, Bot, CheckCircle, ExternalLink, GitCommitHorizontal, Group, HeartHandshake, MapPin, Sparkles, Star, Wind, CircleDollarSign } from 'lucide-react';
import { useState } from "react";
import { logUserChoice } from "@/app/actions";
import { useToast } from "@/hooks/use-toast";

const aspectIconMap: { [key: string]: React.ElementType } = {
  food: GitCommitHorizontal,
  service: HeartHandshake,
  ambiance: Wind,
};

const checklistIconMap: { [key: string]: React.ElementType } = {
    privateRoomQuality: CheckCircle,
    noiseLevel: CheckCircle,
    groupService: CheckCircle,
};

const formatPriceLevel = (priceLevel?: string): string => {
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

interface RecommendationDetailCardProps {
  recommendation: RecommendationResult;
}

export default function RecommendationDetailCard({ recommendation }: RecommendationDetailCardProps) {
  const { suggestion, analysis, photoUrl, googleMapsUri, websiteUri, address, rating, userRatingsTotal, priceLevel, placeId } = recommendation;
  const { toast } = useToast();
  const [hasLogged, setHasLogged] = useState(false);

  const handleLinkClick = async () => {
    if (hasLogged) return;
    await logUserChoice(placeId);
    toast({
      title: "フィードバックありがとうございます",
      description: `${suggestion.restaurantName}へのご興味、参考にさせていただきます！`,
    });
    setHasLogged(true);
  };

  return (
    <Card className="w-full shadow-xl overflow-hidden border-2 border-accent/50 bg-amber-50/30">
      <CardHeader className="p-0">
        <div className="relative aspect-[16/9] bg-muted">
            <Image 
                src={photoUrl || "https://placehold.co/600x338.png"}
                alt={suggestion.restaurantName}
                fill
                sizes="(max-width: 768px) 100vw, 50vw"
                className="object-cover"
                data-ai-hint="restaurant food"
            />
            <div className="absolute top-2 right-2">
                <Badge variant="destructive" className="text-lg font-bold shadow-lg bg-accent text-accent-foreground">
                    <Award className="mr-2 h-5 w-5" />
                    AIのおすすめ
                </Badge>
            </div>
        </div>
      </CardHeader>
      <CardContent className="p-6">
        <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-2 mb-4">
            <div>
                <CardTitle className="text-2xl font-headline text-primary mb-1">{suggestion.restaurantName}</CardTitle>
                {address && (
                    <div className="flex items-center text-sm text-muted-foreground gap-1">
                        <MapPin className="h-4 w-4" />
                        <span>{address}</span>
                    </div>
                )}
            </div>
            {rating && (
                <div className="flex items-center gap-4 bg-background p-2 rounded-lg border flex-shrink-0 mt-2 md:mt-0">
                    <div className="flex items-center gap-1">
                        <Star className="h-5 w-5 text-yellow-500 fill-yellow-400" />
                        <span className="font-bold text-lg">{rating}</span>
                        <span className="text-sm text-muted-foreground">({userRatingsTotal}件)</span>
                    </div>
                    {priceLevel && formatPriceLevel(priceLevel) && (
                         <div className="flex items-center gap-1 text-muted-foreground border-l pl-4">
                            <CircleDollarSign className="h-5 w-5" />
                            <span className="font-semibold text-lg text-foreground">{formatPriceLevel(priceLevel)}</span>
                        </div>
                    )}
                </div>
            )}
        </div>
        
        <div className="mt-4 p-4 bg-primary/5 rounded-lg border border-primary/20">
            <h4 className="font-bold text-lg text-primary flex items-center mb-2">
                <Sparkles className="h-5 w-5 mr-2 text-accent" />
                AIからの推薦理由
            </h4>
            <p className="text-sm text-primary/90 leading-relaxed">
                {suggestion.recommendationRationale}
            </p>
        </div>

        <Accordion type="single" collapsible className="w-full mt-4">
          <AccordionItem value="analysis">
            <AccordionTrigger className="text-base font-semibold hover:no-underline">
              <div className="flex items-center gap-2">
                <Bot className="h-5 w-5 text-primary" />
                <span>レビューの詳細分析を開く</span>
              </div>
            </AccordionTrigger>
            <AccordionContent className="pt-2 space-y-4">
                <div className="p-4 bg-background rounded-lg border">
                    <h5 className="font-semibold mb-2 flex items-center"><Award className="mr-2 h-4 w-4"/>総合評価</h5>
                    <p className="text-sm text-muted-foreground">{analysis.overallSentiment}</p>
                </div>
                <div className="p-4 bg-background rounded-lg border">
                    <h5 className="font-semibold mb-2 flex items-center"><Group className="mr-2 h-4 w-4"/>グループ利用の体験</h5>
                    <p className="text-sm text-muted-foreground">{analysis.groupDiningExperience}</p>
                </div>

                {analysis.keyAspects && (
                    <div className="p-4 bg-background rounded-lg border">
                        <h5 className="font-semibold mb-3">注目ポイント</h5>
                        <ul className="space-y-2 text-sm">
                            {Object.entries(analysis.keyAspects).map(([key, value]) => {
                                const Icon = aspectIconMap[key] || Star;
                                const label = key === 'food' ? '料理' : key === 'service' ? 'サービス' : '雰囲気';
                                return (
                                <li key={key} className="flex items-start">
                                    <div className="flex items-center font-medium w-24">
                                        <Icon className="mr-2 h-4 w-4 text-accent" />
                                        <span>{label}:</span>
                                    </div>
                                    <span className="text-muted-foreground flex-1">{value as string}</span>
                                </li>
                                );
                            })}
                        </ul>
                    </div>
                )}
                
                {analysis.kanjiChecklist && (
                     <div className="p-4 bg-background rounded-lg border">
                        <h5 className="font-semibold mb-3">幹事向けチェックリスト</h5>
                         <ul className="space-y-2 text-sm">
                           {Object.entries(analysis.kanjiChecklist).map(([key, value]) => {
                                const Icon = checklistIconMap[key] || CheckCircle;
                                const label = key === 'privateRoomQuality' ? '個室の質' : key === 'noiseLevel' ? '店内の静かさ' : '団体サービス';
                                return (
                                <li key={key} className="flex items-start">
                                    <div className="flex items-center font-medium w-32">
                                        <Icon className="mr-2 h-4 w-4 text-green-600" />
                                        <span>{label}:</span>
                                    </div>
                                    <span className="text-muted-foreground flex-1">{value as string}</span>
                                </li>
                                );
                           })}
                        </ul>
                    </div>
                )}

            </AccordionContent>
          </AccordionItem>
        </Accordion>
      </CardContent>
      <CardFooter className="bg-background/50 p-4 flex flex-col sm:flex-row gap-2">
        {googleMapsUri && (
            <Button asChild variant="outline" className="w-full" onClick={handleLinkClick}>
                <a href={googleMapsUri} target="_blank" rel="noopener noreferrer">
                    <MapPin className="mr-2" />
                    Google Mapsで見る
                </a>
            </Button>
        )}
         {websiteUri && (
            <Button asChild variant="outline" className="w-full" onClick={handleLinkClick}>
                <a href={websiteUri} target="_blank" rel="noopener noreferrer">
                    <ExternalLink className="mr-2" />
                    ウェブサイト
                </a>
            </Button>
        )}
      </CardFooter>
    </Card>
  );
}
