
import type { RestaurantCriteria } from "@/lib/schemas";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CalendarDays, Clock, DollarSign, MapPin, Utensils, DoorOpen, CheckSquare, XSquare, PartyPopper } from "lucide-react";

interface PreferenceDisplayCardProps {
  criteria: RestaurantCriteria & { date: Date }; // Ensure date is Date object for display
}

export default function PreferenceDisplayCard({ criteria }: PreferenceDisplayCardProps) {
  return (
    <Card className="shadow-lg">
      <CardHeader>
        <CardTitle className="text-xl font-headline flex items-center">
          <Utensils className="mr-2 h-6 w-6 text-primary" />
          あなたの検索条件
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        <div className="flex items-center">
          <PartyPopper className="mr-2 h-5 w-5 text-muted-foreground" />
          <strong>利用目的:</strong>&nbsp;{criteria.purposeOfUse}
        </div>
        <div className="flex items-center">
          <CalendarDays className="mr-2 h-5 w-5 text-muted-foreground" />
          <strong>日付:</strong>&nbsp;{criteria.date.toLocaleDateString('ja-JP')}
        </div>
        <div className="flex items-center">
          <Clock className="mr-2 h-5 w-5 text-muted-foreground" />
          <strong>時間:</strong>&nbsp;{criteria.time}
        </div>
        <div className="flex items-center">
          <DollarSign className="mr-2 h-5 w-5 text-muted-foreground" />
          <strong>予算:</strong>&nbsp;{criteria.budget}
        </div>
        <div className="flex items-center">
          <Utensils className="mr-2 h-5 w-5 text-muted-foreground" />
          <strong>お店のジャンル:</strong>&nbsp;{criteria.cuisine}
        </div>
        <div className="flex items-center">
          <MapPin className="mr-2 h-5 w-5 text-muted-foreground" />
          <strong>場所:</strong>&nbsp;{criteria.location}
        </div>
        {criteria.privateRoomRequested !== undefined && (
          <div className="flex items-center">
            <DoorOpen className="mr-2 h-5 w-5 text-muted-foreground" />
            <strong>個室希望:</strong>&nbsp;
            {criteria.privateRoomRequested ? (
              <CheckSquare className="h-5 w-5 text-primary" />
            ) : (
              <XSquare className="h-5 w-5 text-destructive" />
            )}
            <span className="ml-1">{criteria.privateRoomRequested ? "はい" : "いいえ"}</span>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
