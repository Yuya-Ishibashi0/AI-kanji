
"use client";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter, CardHeader } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { CircleDollarSign, MapPin, Tag, ExternalLink } from "lucide-react";
import Image from 'next/image';
import { logUserChoice } from "@/app/actions";
import { useState } from "react";

interface RestaurantInfoCardProps {
  placeId: string;
  name: string;
  photoUrl?: string;
  address?: string;
  types?: string[];
  priceLevel?: string;
  websiteUri?: string;
  googleMapsUri?: string;
}

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

export default function RestaurantInfoCard({ 
  placeId,
  name, 
  photoUrl, 
  address,
  types,
  priceLevel,
  websiteUri,
  googleMapsUri,
}: RestaurantInfoCardProps) {
  const { toast } = useToast();
  const [hasLogged, setHasLogged] = useState(false);

  const handleLinkClick = async () => {
    if (hasLogged) return;
    const result = await logUserChoice(placeId);
    if (result.success) {
        toast({
            title: "フィードバックありがとうございます",
            description: `${name}へのご興味、参考にさせていただきます！`,
        });
    } else {
        console.error("Failed to log choice for popular restaurant.");
    }
    setHasLogged(true);
  };
  
  const mainCategory = types?.find(t => t !== 'restaurant' && t !== 'food' && t !== 'point_of_interest' && t !== 'establishment')?.replace(/_/g, ' ') || '';
  const city = address?.split('、')[1]?.split(/([市区町村])/).slice(0, 2).join('').trim() || '';

  return (
    <Card className="shadow-lg w-full overflow-hidden border-none flex flex-col">
      <CardHeader className="p-0">
        <div className="aspect-[4/3] bg-muted rounded-t-lg overflow-hidden relative">
          <Image 
            src={photoUrl || "https://placehold.co/400x300.png"}
            alt={name} 
            fill
            sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw"
            style={{ objectFit: 'cover' }}
            priority
            data-ai-hint="restaurant food"
          />
        </div>
      </CardHeader>
      
      <CardContent className="p-4 space-y-2 flex-grow">
        <h3 className="font-bold text-lg leading-snug">{name}</h3>
        <div className="text-sm text-muted-foreground space-y-1">
          {(mainCategory || city) && (
             <div className="flex items-center gap-1">
              <Tag className="h-4 w-4 shrink-0" />
              <span>{mainCategory} {city && `• ${city}`}</span>
            </div>
          )}
          {address && (
            <div className="flex items-center gap-1">
              <MapPin className="h-4 w-4 shrink-0" />
              <span className="truncate">{address}</span>
            </div>
          )}
          {priceLevel && formatPriceLevel(priceLevel) && (
            <div className="flex items-center gap-1">
              <CircleDollarSign className="h-4 w-4 shrink-0" />
              <span>{formatPriceLevel(priceLevel)}</span>
            </div>
          )}
        </div>
      </CardContent>

      <CardFooter className="p-4 pt-0 flex flex-col sm:flex-row gap-2">
        {googleMapsUri && (
            <Button asChild variant="outline" className="w-full" onClick={handleLinkClick}>
                <a href={googleMapsUri} target="_blank" rel="noopener noreferrer">
                    <MapPin className="mr-2" />
                    Google Maps
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
