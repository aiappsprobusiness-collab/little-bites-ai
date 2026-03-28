import { LEGAL_TERMS_VERSION } from "@/constants/legalVersions";

/** Единый футер «Редакция от …» для Terms / Privacy / Subscription. Дата только из `legalVersions.ts`. */
export function LegalDocumentRevisionFooter() {
  return (
    <div className="mt-8 text-sm text-muted-foreground">
      Редакция от: {LEGAL_TERMS_VERSION}
    </div>
  );
}
