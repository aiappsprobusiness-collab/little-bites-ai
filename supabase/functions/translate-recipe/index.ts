/**
 * ML-5: Post-save translation for new recipes.
 * Request: { recipe_id: uuid, target_locale: string }.
 * Fetches recipe (RLS: user must own), translates title/description/chef_advice via DeepSeek,
 * upserts recipe_translations. Failure-safe: errors are logged, response 200.
 */
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Max-Age": "86400",
};

function jsonResponse(body: unknown, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

interface TranslateBody {
  recipe_id?: string;
  target_locale?: string;
}

interface RecipeRow {
  id: string;
  title: string | null;
  description: string | null;
  chef_advice: string | null;
  locale: string | null;
}

interface TranslatedFields {
  title?: string;
  description?: string;
  chef_advice?: string;
}

const SUPPORTED_LOCALES = ["ru", "en"];

function normalizeLocale(loc: string): string {
  const s = (loc || "en").trim().toLowerCase().split("-")[0];
  return SUPPORTED_LOCALES.includes(s) ? s : "en";
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { status: 200, headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return jsonResponse({ ok: false, error: "Method not allowed" }, 405);
  }

  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ") || !authHeader.slice(7).trim()) {
    return jsonResponse({ ok: false, error: "Unauthorized" }, 401);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  const deepseekKey = Deno.env.get("DEEPSEEK_API_KEY");

  if (!supabaseUrl || !anonKey) {
    console.error("translate-recipe: SUPABASE_URL or SUPABASE_ANON_KEY missing");
    return jsonResponse({ ok: true, status: "error" }, 200);
  }
  if (!deepseekKey) {
    console.error("translate-recipe: DEEPSEEK_API_KEY missing");
    return jsonResponse({ ok: true, status: "error" }, 200);
  }

  let body: TranslateBody;
  try {
    body = (await req.json()) as TranslateBody;
  } catch {
    return jsonResponse({ ok: false, error: "Invalid JSON" }, 400);
  }

  const recipeId = typeof body.recipe_id === "string" ? body.recipe_id.trim() : "";
  const targetLocale = normalizeLocale(typeof body.target_locale === "string" ? body.target_locale : "en");

  if (!recipeId) {
    return jsonResponse({ ok: false, error: "recipe_id required" }, 400);
  }

  const supabase = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
  });

  try {
    const { data: recipe, error: fetchError } = await supabase
      .from("recipes")
      .select("id, title, description, chef_advice, locale")
      .eq("id", recipeId)
      .maybeSingle();

    if (fetchError) {
      console.error("translate-recipe: fetch recipe error", fetchError.message, recipeId);
      return jsonResponse({ ok: true, status: "error" }, 200);
    }

    const row = recipe as RecipeRow | null;
    if (!row) {
      return jsonResponse({ ok: true, status: "skipped" }, 200);
    }

    const { data: hasTranslation } = await supabase.rpc("has_recipe_translation", {
      p_recipe_id: recipeId,
      p_locale: targetLocale,
    });
    if (hasTranslation === true) {
      return jsonResponse({ ok: true, status: "skipped" }, 200);
    }

    const sourceLocale = normalizeLocale(row.locale ?? "en");
    if (sourceLocale === targetLocale) {
      return jsonResponse({ ok: true, status: "skipped" }, 200);
    }

    const title = (row.title ?? "").trim();
    const description = (row.description ?? "").trim();
    const chefAdvice = (row.chef_advice ?? "").trim();
    if (!title && !description && !chefAdvice) {
      return jsonResponse({ ok: true, status: "skipped" }, 200);
    }

    const systemPrompt = `You are a translator. Translate recipe fields from ${sourceLocale} to ${targetLocale}. Reply with ONLY a valid JSON object (no markdown, no extra text) with exactly these keys: "title", "description", "chef_advice". Use empty string for missing or empty source. Preserve meaning and cooking terminology.`;
    const userContent = JSON.stringify({
      title: title || "",
      description: description || "",
      chef_advice: chefAdvice || "",
    });

    const llmRes = await fetch("https://api.deepseek.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${deepseekKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "deepseek-chat",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userContent },
        ],
        max_tokens: 2048,
        temperature: 0.2,
      }),
    });

    if (!llmRes.ok) {
      const errText = await llmRes.text();
      console.error("translate-recipe: DeepSeek error", llmRes.status, errText.slice(0, 300));
      return jsonResponse({ ok: true, status: "error" }, 200);
    }

    const llmJson = (await llmRes.json()) as { choices?: Array<{ message?: { content?: string } }> };
    const rawContent = (llmJson.choices?.[0]?.message?.content ?? "").trim();
    let parsed: TranslatedFields = {};
    try {
      const cleaned = rawContent.replace(/^```\w*\n?|\n?```$/g, "").trim();
      parsed = JSON.parse(cleaned) as TranslatedFields;
    } catch {
      console.error("translate-recipe: parse LLM response failed", rawContent.slice(0, 200));
      return jsonResponse({ ok: true, status: "error" }, 200);
    }

    const { error: rpcError } = await supabase.rpc("upsert_recipe_translation", {
      p_recipe_id: recipeId,
      p_locale: targetLocale,
      p_title: typeof parsed.title === "string" ? parsed.title : title,
      p_description: typeof parsed.description === "string" ? parsed.description : description,
      p_chef_advice: typeof parsed.chef_advice === "string" ? parsed.chef_advice : chefAdvice,
      p_translation_status: "auto_generated",
      p_source: "ai",
    });

    if (rpcError) {
      console.error("translate-recipe: upsert_recipe_translation error", rpcError.message, recipeId);
      return jsonResponse({ ok: true, status: "error" }, 200);
    }

    return jsonResponse({ ok: true, status: "created", translated: targetLocale }, 200);
  } catch (err) {
    console.error("translate-recipe: unexpected error", err);
    return jsonResponse({ ok: true, status: "error" }, 200);
  }
});
