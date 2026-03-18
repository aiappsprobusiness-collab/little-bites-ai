/**
 * ML-5 + ML-7: Post-save translation for new recipes.
 * Translates: title, description, chef_advice (ML-5) + steps.instruction + ingredients name/display_text (ML-7).
 * Request: { recipe_id: uuid, target_locale: string [, __user_jwt: string ] }.
 * Skip: target_locale === recipe.locale OR has_recipe_full_locale_pack (full pack = recipe + steps + ingredients).
 * ML-7: no batch backfill; targets new/active recipes only; failure-safe.
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
  __user_jwt?: string;
}

interface RecipeRow {
  id: string;
  title: string | null;
  description: string | null;
  chef_advice: string | null;
  locale: string | null;
}

interface StepRow {
  id: string;
  step_number: number;
  instruction: string | null;
}

interface IngredientRow {
  id: string;
  name: string | null;
  display_text: string | null;
}

interface LLMTranslated {
  title?: string;
  description?: string;
  chef_advice?: string;
  steps?: Array< { id: string; step_number?: number; instruction?: string } >;
  ingredients?: Array< { id: string; name?: string; display_text?: string } >;
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

  const authHeader = req.headers.get("Authorization");
  const userToken = typeof body.__user_jwt === "string" && body.__user_jwt.trim()
    ? body.__user_jwt.trim()
    : (authHeader?.startsWith("Bearer ") ? authHeader.slice(7).trim() : "");
  const effectiveAuth = userToken ? `Bearer ${userToken}` : "";
  if (!effectiveAuth) {
    return jsonResponse({ ok: false, error: "Unauthorized" }, 401);
  }

  if (Deno.env.get("ENABLE_RECIPE_TRANSLATION") !== "true") {
    return jsonResponse({ ok: true, status: "skipped" }, 200);
  }

  const recipeId = typeof body.recipe_id === "string" ? body.recipe_id.trim() : "";
  const targetLocaleRaw = typeof body.target_locale === "string" ? body.target_locale.trim() : "";
  if (!targetLocaleRaw) {
    return jsonResponse({ ok: true, status: "skipped" }, 200);
  }
  const targetLocale = normalizeLocale(targetLocaleRaw);

  if (!recipeId) {
    return jsonResponse({ ok: false, error: "recipe_id required" }, 400);
  }

  const supabase = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: effectiveAuth } },
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

    const sourceLocale = normalizeLocale(row.locale ?? "en");
    if (sourceLocale === targetLocale) {
      return jsonResponse({ ok: true, status: "skipped" }, 200);
    }

    const { data: hasFullPack } = await supabase.rpc("has_recipe_full_locale_pack", {
      p_recipe_id: recipeId,
      p_locale: targetLocale,
    });
    if (hasFullPack === true) {
      return jsonResponse({ ok: true, status: "skipped" }, 200);
    }

    const [stepsRes, ingredientsRes] = await Promise.all([
      supabase
        .from("recipe_steps")
        .select("id, step_number, instruction")
        .eq("recipe_id", recipeId)
        .order("step_number"),
      supabase
        .from("recipe_ingredients")
        .select("id, name, display_text")
        .eq("recipe_id", recipeId)
        .order("order_index"),
    ]);

    const steps = (stepsRes.data ?? []) as StepRow[];
    const ingredients = (ingredientsRes.data ?? []) as IngredientRow[];

    const title = (row.title ?? "").trim();
    const description = (row.description ?? "").trim();
    const chefAdvice = (row.chef_advice ?? "").trim();
    const hasRecipeText = !!(title || description || chefAdvice);
    const hasSteps = steps.length > 0 && steps.some((s) => (s.instruction ?? "").trim());
    const hasIngredients = ingredients.length > 0 && ingredients.some((i) => (i.name ?? "").trim() || (i.display_text ?? "").trim());
    if (!hasRecipeText && !hasSteps && !hasIngredients) {
      return jsonResponse({ ok: true, status: "skipped" }, 200);
    }

    const systemPrompt = `You are a translator. Translate from ${sourceLocale} to ${targetLocale}. Reply with ONLY a valid JSON object (no markdown, no extra text). Preserve structure and ids. Keys: "title", "description", "chef_advice" (strings), "steps" (array of { "id", "step_number", "instruction" }), "ingredients" (array of { "id", "name", "display_text" }). Use empty string for missing or empty source. Preserve meaning and cooking terminology.`;
    const userContent = JSON.stringify({
      title: title || "",
      description: description || "",
      chef_advice: chefAdvice || "",
      steps: steps.map((s) => ({ id: s.id, step_number: s.step_number, instruction: (s.instruction ?? "").trim() })),
      ingredients: ingredients.map((i) => ({ id: i.id, name: (i.name ?? "").trim(), display_text: (i.display_text ?? "").trim() })),
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
        max_tokens: 4096,
        temperature: 0.2,
      }),
    });

    if (!llmRes.ok) {
      const errText = await llmRes.text();
      console.error("translate-recipe: DeepSeek error", llmRes.status, errText.slice(0, 300));
      return jsonResponse({ ok: true, status: "error" }, 200);
    }

    const llmJson = (await llmRes.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
      usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number };
    };
    const rawContent = (llmJson.choices?.[0]?.message?.content ?? "").trim();

    if (llmJson.usage) {
      const inputTokens = llmJson.usage.prompt_tokens ?? 0;
      const outputTokens = llmJson.usage.completion_tokens ?? 0;
      const totalTokens = llmJson.usage.total_tokens ?? inputTokens + outputTokens;
      supabase.auth.getUser(userToken).then(({ data: { user } }) => {
        if (!user?.id) return;
        supabase
          .from("token_usage_log")
          .insert({
            user_id: user.id,
            action_type: "recipe_translation",
            input_tokens: inputTokens,
            output_tokens: outputTokens,
            total_tokens: totalTokens,
          })
          .then(({ error }) => { if (error) console.warn("translate-recipe: token_usage_log insert failed", error.message); })
          .catch((err) => console.warn("translate-recipe: token_usage_log error", err));
      }).catch(() => {});
    }

    let parsed: LLMTranslated = {};
    try {
      const cleaned = rawContent.replace(/^```\w*\n?|\n?```$/g, "").trim();
      parsed = JSON.parse(cleaned) as LLMTranslated;
    } catch {
      console.error("translate-recipe: parse LLM response failed", rawContent.slice(0, 200));
      return jsonResponse({ ok: true, status: "error" }, 200);
    }

    const translatedTitle = typeof parsed.title === "string" ? parsed.title : title;
    const translatedDescription = typeof parsed.description === "string" ? parsed.description : description;
    const translatedChefAdvice = typeof parsed.chef_advice === "string" ? parsed.chef_advice : chefAdvice;

    const { error: rpcRecipeError } = await supabase.rpc("upsert_recipe_translation", {
      p_recipe_id: recipeId,
      p_locale: targetLocale,
      p_title: translatedTitle,
      p_description: translatedDescription,
      p_chef_advice: translatedChefAdvice,
      p_translation_status: "auto_generated",
      p_source: "ai",
    });

    if (rpcRecipeError) {
      console.error("translate-recipe: upsert_recipe_translation error", rpcRecipeError.message, recipeId);
      return jsonResponse({ ok: true, status: "error" }, 200);
    }

    let translatedStepsCount = 0;
    let translatedIngredientsCount = 0;
    const stepMap = new Map((parsed.steps ?? []).filter((s) => s?.id).map((s) => [s.id, s]));
    const ingMap = new Map((parsed.ingredients ?? []).filter((i) => i?.id).map((i) => [i.id, i]));

    for (const step of steps) {
      const t = stepMap.get(step.id);
      const instruction = typeof t?.instruction === "string" ? t.instruction.trim() : (step.instruction ?? "").trim();
      if (!instruction) continue;
      const { error: stepErr } = await supabase.rpc("upsert_recipe_step_translation", {
        p_recipe_step_id: step.id,
        p_locale: targetLocale,
        p_instruction: instruction,
        p_translation_status: "auto_generated",
        p_source: "ai",
      });
      if (stepErr) {
        console.warn("translate-recipe: upsert_recipe_step_translation error", stepErr.message, step.id);
      } else {
        translatedStepsCount += 1;
      }
    }

    for (const ing of ingredients) {
      const t = ingMap.get(ing.id);
      const name = typeof t?.name === "string" ? t.name.trim() : (ing.name ?? "").trim();
      const displayText = typeof t?.display_text === "string" ? t.display_text.trim() : (ing.display_text ?? "").trim();
      if (!name && !displayText) continue;
      const { error: ingErr } = await supabase.rpc("upsert_recipe_ingredient_translation", {
        p_recipe_ingredient_id: ing.id,
        p_locale: targetLocale,
        p_name: name || null,
        p_display_text: displayText || null,
        p_translation_status: "auto_generated",
        p_source: "ai",
      });
      if (ingErr) {
        console.warn("translate-recipe: upsert_recipe_ingredient_translation error", ingErr.message, ing.id);
      } else {
        translatedIngredientsCount += 1;
      }
    }

    return jsonResponse({
      ok: true,
      status: "created",
      translated: targetLocale,
      translated_steps_count: translatedStepsCount,
      translated_ingredients_count: translatedIngredientsCount,
      skipped_steps_count: steps.length - translatedStepsCount,
      skipped_ingredients_count: ingredients.length - translatedIngredientsCount,
    }, 200);
  } catch (err) {
    console.error("translate-recipe: unexpected error", err);
    return jsonResponse({ ok: true, status: "error" }, 200);
  }
});
