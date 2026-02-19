import { useParams, useNavigate } from "react-router-dom";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Circle } from "lucide-react";
import { useFamily } from "@/contexts/FamilyContext";
import { useSubscription } from "@/hooks/useSubscription";
import { getSosTopicConfig } from "@/data/sosTopics";
import { Paywall } from "@/components/subscription/Paywall";

/** Обрезает текст до конца последнего предложения в пределах maxChars (~4–5 строк). */
function trimToSentenceEnd(text: string, maxChars: number = 320): string {
  const trimmed = text.trim();
  if (trimmed.length <= maxChars) return trimmed;
  const slice = trimmed.slice(0, maxChars);
  const lastEnd = Math.max(
    slice.lastIndexOf(". "),
    slice.lastIndexOf("? "),
    slice.lastIndexOf("! ")
  );
  if (lastEnd > maxChars * 0.4) return slice.slice(0, lastEnd + 1).trim();
  const lastSpace = slice.lastIndexOf(" ");
  return (lastSpace > 0 ? slice.slice(0, lastSpace) : slice).trim();
}

export default function SosTopicPage() {
  const { topicId } = useParams<{ topicId: string }>();
  const navigate = useNavigate();
  const { hasAccess } = useSubscription();
  const [paywallOpen, setPaywallOpen] = useState(false);

  const topic = topicId ? getSosTopicConfig(topicId) : null;
  const locked = topic?.requiresPremium && !hasAccess;

  if (!topicId || !topic) {
    navigate("/sos", { replace: true });
    return null;
  }

  const handleAskAssistant = () => {
    if (locked) {
      setPaywallOpen(true);
      return;
    }
    const prefill = topic.prefillText || topic.title;
    navigate(`/chat?mode=help&prefill=${encodeURIComponent(prefill)}`);
  };

  const fullSummary = topic.intro.slice(0, 2).join(" ");
  const summaryText = trimToSentenceEnd(fullSummary);
  const causesList = topic.bullets.slice(0, 3);
  const causesExtra = topic.bullets.length - causesList.length;

  return (
    <div className="min-h-dvh bg-background flex flex-col">
      <header className="sticky top-0 z-40 flex items-center gap-2 min-h-[var(--header-content-height)] px-4 py-3 border-b border-border bg-background/95 backdrop-blur shrink-0">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => navigate("/sos")}
          aria-label="Назад"
        >
          <ArrowLeft className="w-5 h-5" />
        </Button>
        <h1
          className="flex-1 min-w-0 text-[17px] font-semibold text-foreground leading-snug line-clamp-2 break-words hyphens-auto"
          style={{ wordBreak: "break-word" }}
        >
          {topic.title}
        </h1>
      </header>

      <main className="flex-1 overflow-y-auto overflow-x-hidden px-4 py-6 pb-10">
        <article className="space-y-8">
          {/* A) Короткое резюме (4–5 строк, без обрыва мысли) */}
          <p className="text-sm text-foreground leading-[1.65]">
            {summaryText}
          </p>

          {/* B) Возможные причины — макс. 3 пункта */}
          {causesList.length > 0 && (
            <section>
              <h2 className="text-sm font-semibold text-foreground mb-2">Возможные причины</h2>
              <ul className="text-sm text-muted-foreground space-y-1.5 leading-[1.6]">
                {causesList.map((b, i) => (
                  <li key={i} className="flex items-start gap-2">
                    <Circle className="w-1.5 h-1.5 shrink-0 mt-2 fill-primary/70 text-primary/70" aria-hidden />
                    <span>{b}</span>
                  </li>
                ))}
                {causesExtra > 0 && (
                  <li className="text-muted-foreground/80 text-[12px] pl-3.5">
                    и ещё {causesExtra}{" "}
                    {causesExtra === 1 ? "причина" : causesExtra >= 2 && causesExtra <= 4 ? "причины" : "причин"}
                  </li>
                )}
              </ul>
            </section>
          )}

          {/* C) Один главный CTA */}
          <section className="pt-2">
            <button
              type="button"
              onClick={handleAskAssistant}
              className="w-full h-[52px] rounded-[18px] font-semibold bg-primary text-primary-foreground shadow-none hover:opacity-90 active:opacity-95 transition-opacity"
            >
              Задать вопрос помощнику
            </button>
          </section>
        </article>
      </main>

      <Paywall
        isOpen={paywallOpen}
        onClose={() => setPaywallOpen(false)}
        onSubscribe={() => setPaywallOpen(false)}
      />
    </div>
  );
}
