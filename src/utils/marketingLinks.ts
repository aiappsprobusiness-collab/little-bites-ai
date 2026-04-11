import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";
import { STATIC_MARKETING_LINKS } from "@/config/marketingLinks";

export type MarketingLinkRow = Database["public"]["Tables"]["marketing_links"]["Row"];

const DEFAULT_SOURCE = "youtube";
const DEFAULT_MEDIUM = "shorts";

function randomSuffix2to3(): string {
  const len = 2 + Math.floor(Math.random() * 2);
  const chars = "abcdefghijklmnopqrstuvwxyz0123456789";
  let s = "";
  for (let i = 0; i < len; i++) {
    s += chars[Math.floor(Math.random() * chars.length)]!;
  }
  return s;
}

function normalizeSlugPart(s: string): string {
  return s
    .toLowerCase()
    .trim()
    .replace(/\s+/g, "_")
    .replace(/[^a-z0-9_]+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_|_$/g, "");
}

function buildAutoSlug(campaign: string, content: string): string {
  const base = normalizeSlugPart(`${campaign} ${content}`) || "link";
  return `${base}_${randomSuffix2to3()}`;
}

export function buildMarketingUrl(params: {
  source: string;
  medium: string;
  campaign: string;
  content: string;
}): string {
  const q = new URLSearchParams({
    utm_source: params.source,
    utm_medium: params.medium,
    utm_campaign: params.campaign,
    utm_content: params.content,
  });
  return `/?${q.toString()}`;
}

async function isSlugTaken(slug: string): Promise<boolean> {
  if (STATIC_MARKETING_LINKS[slug]) return true;
  const { data, error } = await supabase.from("marketing_links").select("id").eq("slug", slug).maybeSingle();
  if (error) throw error;
  return data != null;
}

export type CreateMarketingLinkInput = {
  slug?: string;
  campaign: string;
  content: string;
  medium?: string;
  source?: string;
};

/**
 * Генерирует slug/url, сохраняет строку в `marketing_links`, возвращает запись.
 */
export async function createMarketingLink(input: CreateMarketingLinkInput): Promise<MarketingLinkRow> {
  const source = input.source ?? DEFAULT_SOURCE;
  const medium = input.medium ?? DEFAULT_MEDIUM;
  const url = buildMarketingUrl({
    source,
    medium,
    campaign: input.campaign.trim(),
    content: input.content.trim(),
  });

  let slug: string;
  const trimmed = input.slug?.trim();
  if (trimmed) {
    slug = trimmed;
    if (await isSlugTaken(slug)) {
      throw new Error("This slug is already in use");
    }
  } else {
    let candidate: string;
    do {
      candidate = buildAutoSlug(input.campaign, input.content);
    } while (await isSlugTaken(candidate));
    slug = candidate;
  }

  const { data, error } = await supabase
    .from("marketing_links")
    .insert({
      slug,
      url,
      campaign: input.campaign.trim(),
      content: input.content.trim(),
      medium,
      source,
    })
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function getMarketingLinks(): Promise<MarketingLinkRow[]> {
  const { data, error } = await supabase.from("marketing_links").select("*").order("created_at", { ascending: false });
  if (error) throw error;
  return data ?? [];
}

export async function getMarketingLinkBySlug(slug: string): Promise<MarketingLinkRow | null> {
  const key = slug.trim();
  if (!key) return null;
  const { data, error } = await supabase.from("marketing_links").select("*").eq("slug", key).maybeSingle();
  if (error) throw error;
  return data;
}

/** Публичный домен для копирования /go/ ссылок в админке. */
export const MARKETING_GO_PUBLIC_ORIGIN = "https://momrecipes.online";

export function getPublicGoUrl(slug: string): string {
  return `${MARKETING_GO_PUBLIC_ORIGIN.replace(/\/$/, "")}/go/${encodeURIComponent(slug)}`;
}
