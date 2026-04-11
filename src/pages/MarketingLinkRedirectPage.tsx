import { useEffect } from "react";
import { useParams } from "react-router-dom";
import { getStaticMarketingLink } from "@/config/marketingLinks";
import { getMarketingLinkBySlug, incrementMarketingLinkClicks } from "@/utils/marketingLinks";
import { trackUsageEventAwait } from "@/utils/usageEvents";

function resolveRedirectHref(path: string): string {
  if (path.startsWith("http://") || path.startsWith("https://")) return path;
  return new URL(path, window.location.origin).href;
}

/**
 * GET /go/:slug — сначала БД `marketing_links`, затем статический fallback; лог, client-side redirect.
 */
export default function MarketingLinkRedirectPage() {
  const { slug } = useParams<{ slug: string }>();

  useEffect(() => {
    const raw = slug?.trim();
    if (!raw) {
      window.location.replace("/");
      return;
    }

    void (async () => {
      let path = "/";
      let hitFromDb = false;
      try {
        const row = await getMarketingLinkBySlug(raw);
        if (row?.url) {
          path = row.url;
          hitFromDb = true;
        } else {
          path = getStaticMarketingLink(raw)?.url ?? "/";
        }
      } catch {
        path = getStaticMarketingLink(raw)?.url ?? "/";
      }

      const destination_url = resolveRedirectHref(path);

      if (hitFromDb && path !== "/") {
        void incrementMarketingLinkClicks(raw).catch(() => {
          /* редирект не блокируем */
        });
      }

      try {
        if (path !== "/") {
          await trackUsageEventAwait("marketing_link_click", {
            properties: {
              slug: raw,
              destination_url,
              source: "youtube_short_link",
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
