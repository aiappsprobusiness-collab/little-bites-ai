import { MobileLayout } from "@/components/layout/MobileLayout";
import { SubscriptionContent } from "@/components/legal/SubscriptionContent";

export default function Subscription() {
  return (
    <MobileLayout>
      <div className="legal-page mx-auto max-w-[720px] px-4 py-8 text-foreground space-y-6">
        <SubscriptionContent />
      </div>
    </MobileLayout>
  );
}
