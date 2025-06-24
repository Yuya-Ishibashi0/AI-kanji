
import type { RecommendationResult, RestaurantCriteria } from "@/lib/schemas";
import { Loader2, Wand2 } from "lucide-react";
import PreferenceDisplayCard from "./preference-display-card";
import RecommendationDetailCard from "./recommendation-detail-card";
import { Card } from "./ui/card";

interface RecommendationResultsProps {
    isLoading: boolean;
    recommendations: RecommendationResult[] | null;
    lastCriteria: (RestaurantCriteria & { date: Date }) | null;
}

export default function RecommendationResults({
    isLoading,
    recommendations,
    lastCriteria
}: RecommendationResultsProps) {
    if (isLoading) {
        return (
            <div className="flex flex-col items-center justify-center space-y-4 p-8 bg-card rounded-lg shadow-lg mt-12">
                <Loader2 className="h-12 w-12 text-primary animate-spin" />
                <p className="text-lg font-semibold text-primary">AIが良いお店を探しています...</p>
                <p className="text-sm text-muted-foreground">少々お待ちください。</p>
            </div>
        );
    }

    if (!recommendations || !lastCriteria) {
        // Render nothing if there are no recommendations to show yet and it's not loading
        return null;
    }

    return (
        <div className="space-y-8 mt-12">
            <PreferenceDisplayCard criteria={lastCriteria} />

            {recommendations.length > 0 ? (
                <div className="space-y-6">
                    <h2 className="text-2xl font-headline font-bold flex items-center">
                        <Wand2 className="mr-2 h-6 w-6 text-accent" />
                        AIからの提案
                    </h2>
                    <div className="space-y-8">
                        {recommendations.map((rec) => (
                            <RecommendationDetailCard
                                key={rec.placeId}
                                recommendation={rec}
                            />
                        ))}
                    </div>
                </div>
            ) : (
                <Card className="text-center py-16 text-muted-foreground shadow-lg">
                    <h3 className="text-xl font-semibold text-foreground">条件に合うお店が見つかりませんでした</h3>
                    <p className="mt-2">検索条件を変更して、再度お試しください。</p>
                </Card>
            )}
        </div>
    );
}
