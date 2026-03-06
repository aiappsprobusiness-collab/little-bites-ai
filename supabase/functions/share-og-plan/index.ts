/**
 * OG preview for shared plan links /p/:ref.
 * GET ?ref=:shareRef → HTML with og:title, og:description, og:image, og:url.
 * Used by proxy (e.g. Cloudflare Worker) for crawler requests; browsers get SPA from GitHub Pages.
 */
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const BASE_URL = "https://momrecipes.online";
const OG_PLAN_IMAGE = `${BASE_URL}/og/og-plan.jpg`;

function htmlResponse(html: string, status: number) {
  return new Response(html, {
    status,
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

serve(async (req) => {
  if (req.method !== "GET") {
    return new Response("Method not allowed", { status: 405 });
  }

  const url = new URL(req.url);
  const ref = url.searchParams.get("ref")?.trim();
  if (!ref) {
    return htmlResponse(
      `<!DOCTYPE html><html><head><meta charset="utf-8"><title>План питания</title><meta http-equiv="refresh" content="0;url=${BASE_URL}/"></head><body><p><a href="${BASE_URL}/">MomRecipes</a></p></body></html>`,
      400
    );
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceRoleKey) {
    return htmlResponse("<!DOCTYPE html><html><body>Error</body></html>", 500);
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey);
  const { data: row, error } = await supabase
    .from("shared_plans")
    .select("payload")
    .eq("ref", ref)
    .limit(1)
    .maybeSingle();

  if (error || !row?.payload) {
    return htmlResponse(
      `<!DOCTYPE html><html><head><meta charset="utf-8"><title>План не найден</title><meta http-equiv="refresh" content="0;url=${BASE_URL}/"></head><body><p><a href="${BASE_URL}/">MomRecipes</a></p></body></html>`,
      404
    );
  }

  const ogTitle = "Меню на день из MomRecipes";
  const ogDescription = "План питания для семьи — составлено автоматически за 30 секунд";
  const canonicalUrl = `${BASE_URL}/p/${encodeURIComponent(ref)}`;

  const metaTags = [
    `<meta property="og:type" content="website">`,
    `<meta property="og:url" content="${escapeHtml(canonicalUrl)}">`,
    `<meta property="og:title" content="${escapeHtml(ogTitle)}">`,
    `<meta property="og:description" content="${escapeHtml(ogDescription)}">`,
    `<meta property="og:image" content="${OG_PLAN_IMAGE}">`,
    `<meta property="og:image:width" content="1200">`,
    `<meta property="og:image:height" content="630">`,
    `<meta name="twitter:card" content="summary_large_image">`,
    `<meta name="twitter:title" content="${escapeHtml(ogTitle)}">`,
    `<meta name="twitter:description" content="${escapeHtml(ogDescription)}">`,
    `<meta name="twitter:image" content="${OG_PLAN_IMAGE}">`,
  ];

  const html = `<!DOCTYPE html>
<html lang="ru">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(ogTitle)}</title>
  ${metaTags.join("\n  ")}
</head>
<body>
  <p><a href="${escapeHtml(canonicalUrl)}">${escapeHtml(ogTitle)}</a></p>
</body>
</html>`;

  return htmlResponse(html, 200);
});
