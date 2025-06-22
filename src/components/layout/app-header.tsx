import { Zap } from 'lucide-react';

export default function AppHeader() {
  return (
    <header className="bg-primary text-primary-foreground shadow-md sticky top-0 z-50">
      <div className="container mx-auto px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
            <h1 className="text-2xl md:text-3xl font-headline font-extrabold tracking-tight text-white">
              AI
            </h1>
            <h1 className="text-2xl md:text-3xl font-headline font-extrabold tracking-tight text-accent">
              幹事くん
            </h1>
        </div>
        <Zap className="h-6 w-6 text-accent" />
      </div>
    </header>
  );
}
