/**
 * OG preview for share links /r/:shareRef.
 * GET ?ref=:shareRef → HTML with og:title, og:description, og:image, og:url;
 * then meta refresh to the recipe page so bots get 200 + OG, users get redirect.
 */
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const BASE_URL = "https://momrecipes.online";

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
      `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Рецепт</title><meta http-equiv="refresh" content="0;url=${BASE_URL}/"></head><body><p><a href="${BASE_URL}/">Mom Recipes</a></p></body></html>`,
      400
    );
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceRoleKey) {
    return htmlResponse("<!DOCTYPE html><html><body>Error</body></html>", 500);
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey);
  const { data: shareRow, error: shareError } = await supabase
    .from("share_refs")
    .select("recipe_id")
    .eq("share_ref", ref)
    .limit(1)
    .maybeSingle();

  if (shareError || !shareRow?.recipe_id) {
    return htmlResponse(
      `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Рецепт</title><meta http-equiv="refresh" content="0;url=${BASE_URL}/"></head><body><p><a href="${BASE_URL}/">Mom Recipes</a></p></body></html>`,
      404
    );
  }

  const recipeId = shareRow.recipe_id as string;
  const { data: recipe, error: recipeError } = await supabase
    .from("recipes")
    .select("title, description")
    .eq("id", recipeId)
    .limit(1)
    .maybeSingle();

  const title = recipeError || !recipe ? "Рецепт" : (recipe.title ?? "Рецепт");
  const description =
    recipe && typeof recipe.description === "string" && recipe.description.trim()
      ? recipe.description.trim().slice(0, 200)
      : "Рецепт из приложения Mom Recipes";
  const canonicalUrl = `${BASE_URL}/r/${encodeURIComponent(ref)}`;
  const redirectUrl = canonicalUrl;

  const ogTitle = escapeHtml(title);
  const ogDesc = escapeHtml(description);
  const ogImage = "";
  const ogUrl = escapeHtml(canonicalUrl);

  const metaTags = [
    `<meta property="og:type" content="website">`,
    `<meta property="og:url" content="${ogUrl}">`,
    `<meta property="og:title" content="${ogTitle}">`,
    `<meta property="og:description" content="${ogDesc}">`,
  ];
  if (ogImage) metaTags.push(`<meta property="og:image" content="${ogImage}">`);
  metaTags.push(`<meta name="twitter:card" content="summary_large_image">`);
  metaTags.push(`<meta name="twitter:title" content="${ogTitle}">`);
  metaTags.push(`<meta name="twitter:description" content="${ogDesc}">`);
  if (ogImage) metaTags.push(`<meta name="twitter:image" content="${ogImage}">`);

  const html = `<!DOCTYPE html>
<html lang="ru">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${ogTitle}</title>
  ${metaTags.join("\n  ")}
  <meta http-equiv="refresh" content="0;url=${escapeHtml(redirectUrl)}">
  <script>window.location.replace(${JSON.stringify(redirectUrl)});</script>
</head>
<body>
  <p><a href="${escapeHtml(redirectUrl)}">Открыть рецепт: ${ogTitle}</a></p>
</body>
</html>`;

  return htmlResponse(html, 200);
});
