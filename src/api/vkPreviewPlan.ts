import { SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY } from "@/integrations/supabase/client";

const PATH = "/functions/v1/vk-preview-plan";

export type VkPreviewPlanRequestBody = {
  age_months: number;
  allergies: string[];
  likes: string[];
  dislikes: string[];
  entry_point?: "vk";
  utm?: Record<string, string>;
};

export async function invokeVkPreviewPlan(body: VkPreviewPlanRequestBody, signal?: AbortSignal): Promise<Response> {
  const base = SUPABASE_URL?.replace(/\/$/, "");
  const key = SUPABASE_PUBLISHABLE_KEY;
  if (!base || !key) {
    return new Response(JSON.stringify({ ok: false, error: "Missing Supabase config" }), { status: 500 });
  }
  return fetch(`${base}${PATH}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: key,
    },
    body: JSON.stringify(body),
    signal,
  });
}
