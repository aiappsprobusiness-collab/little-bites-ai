import { MobileLayout } from "@/components/layout/MobileLayout";
import { TermsContent } from "@/components/legal/TermsContent";

export default function Terms() {
  return (
    <MobileLayout>
      <div className="legal-page mx-auto max-w-[720px] px-4 py-8 text-foreground space-y-6">
        <TermsContent />
      </div>
    </MobileLayout>
  );
}
