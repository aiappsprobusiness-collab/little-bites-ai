import { useEffect } from "react";
import { useParams } from "react-router-dom";
import { MARKETING_LINKS } from "@/config/marketingLinks";
import { trackUsageEventAwait } from "@/utils/usageEvents";

function resolveRedirectHref(path: string): string {
  if (path.startsWith("http://") || path.startsWith("https://")) return path;
  return new URL(path, window.location.origin).href;
}

/**
 * GET /go/:slug — логирует клик, затем client-side redirect на целевой URL с UTM.
 */
export default function MarketingLinkRedirectPage() {
  const { slug } = useParams<{ slug: string }>();

  useEffect(() => {
    const raw = slug?.trim();
    if (!raw) {
      window.location.replace("/");
      return;
    }

    const entry = MARKETING_LINKS[raw];
    const path = entry?.url ?? "/";
    const destination_url = resolveRedirectHref(path);

    void (async () => {
      try {
        if (entry) {
          await trackUsageEventAwait("marketing_link_click", {
            properties: {
              slug: raw,
              destination_url,
              source: entry.source ?? "youtube_short_link",
            },
          });
        }
      } catch {
        /* не блокируем редирект */
      }
      window.location.replace(destination_url);
    })();
  }, [slug]);

  return (
    <div className="flex min-h-[40vh] items-center justify-center p-6 text-muted-foreground text-sm">
      Перенаправление…
    </div>
  );
}
