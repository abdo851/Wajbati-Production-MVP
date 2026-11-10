import { EmailBanner } from "@/components/email-banner";
import { HomeIntro } from "@/components/home-intro";
import { MealBoard } from "@/components/meal-board";

export default function HomePage() {
  return (
    <main className="flex-1">
      <EmailBanner />
      <HomeIntro />
      <MealBoard />
    </main>
  );
}
