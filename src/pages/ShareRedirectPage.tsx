import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { trackUsageEvent, setShareAttributionFromShortLink } from "@/utils/usageEvents";
import { Loader2 } from "lucide-react";

/**
 * Короткая ссылка /r/:shareRef → редирект на /recipe/:recipe_id.
 * Атрибуция (share_ref, entry_point) сохраняется для аналитики и auth_success.
 */
export default function ShareRedirectPage() {
  const { shareRef } = useParams<{ shareRef: string }>();
  const navigate = useNavigate();
  const [status, setStatus] = useState<"loading" | "found" | "not_found">("loading");

  useEffect(() => {
    const ref = shareRef?.trim();
    if (!ref) {
      setStatus("not_found");
      return;
    }

    const run = async () => {
      const decoded = decodeURIComponent(ref);
      const { data, error } = await supabase
        .from("share_refs")
        .select("recipe_id")
        .eq("share_ref", decoded)
        .limit(1)
        .maybeSingle();

      if (error || !data?.recipe_id) {
        setStatus("not_found");
        return;
      }

      setShareAttributionFromShortLink(decoded);
      trackUsageEvent("share_landing_view", {
        properties: {
          share_ref: decoded,
          source: "short_link",
          recipe_id: data.recipe_id,
        },
      });
      setStatus("found");
      navigate(`/recipe/${data.recipe_id}`, { replace: true });
    };

    run();
  }, [shareRef, navigate]);

  if (status === "not_found") {
    navigate("/", { replace: true });
    return null;
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div className="flex flex-col items-center gap-4">
        <Loader2 className="w-10 h-10 animate-spin text-primary" aria-hidden />
        <p className="text-sm text-muted-foreground">Открываем рецепт…</p>
      </div>
    </div>
  );
}
