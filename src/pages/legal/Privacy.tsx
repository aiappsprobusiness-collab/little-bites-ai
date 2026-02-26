import { MobileLayout } from "@/components/layout/MobileLayout";
import { PrivacyContent } from "@/components/legal/PrivacyContent";

export default function Privacy() {
  return (
    <MobileLayout>
      <div className="legal-page mx-auto max-w-[720px] px-4 py-8 text-foreground space-y-6">
        <PrivacyContent />
      </div>
    </MobileLayout>
  );
}
