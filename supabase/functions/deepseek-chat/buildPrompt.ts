/**
 * Сборка system prompt: шаблоны, подстановка переменных, возраст, семья.
 * Используется оркестратором (index.ts).
 */

import {
  AGE_CONTEXTS,
  AGE_CONTEXTS_SHORT,
  FREE_RECIPE_TEMPLATE,
  MEAL_SOUP_RULES,
  PREMIUM_RECIPE_TEMPLATE,
  RECIPE_SYSTEM_RULES_V3,
  SOS_PROMPT_TEMPLATE,
  BALANCE_CHECK_TEMPLATE,
} from "./prompts.ts";
import { getAgeCategory } from "./ageCategory.ts";
import { getFamilyContextPromptLine, getFamilyContextPromptLineEmpty } from "./domain/family/index.ts";

export interface MemberData {
  id?: string;
  name?: string;
  birth_date?: string;
  age_months?: number;
  ageMonths?: number;
  ageDescription?: string;
  allergies?: string[];
  preferences?: string[];
  likes?: string[];
  dislikes?: string[];
}

function calculateAge(birthDate: string): { years: number; months: number } {
  const s = (birthDate || "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return { years: 0, months: 0 };
  const birth = new Date(s);
  const today = new Date();
  let months = (today.getFullYear() - birth.getFullYear()) * 12 + (today.getMonth() - birth.getMonth());
  if (today.getDate() < birth.getDate()) months -= 1;
  months = Math.max(0, months);
  return { years: Math.floor(months / 12), months: months % 12 };
}

function formatAgeString(birthDate: string): string {
  const { years, months } = calculateAge(birthDate);
  const total = years * 12 + months;
  if (total === 0) return "";
  if (total < 12) return `${total} мес.`;
  if (months === 0) return `${years} ${years === 1 ? "год" : years < 5 ? "года" : "лет"}`;
  return `${years} г. ${months} мес.`;
}

export function getCalculatedAge(memberData?: MemberData | null): string {
  if (!memberData) return "";
  if (memberData.birth_date && /^\d{4}-\d{2}-\d{2}$/.test(memberData.birth_date.trim())) {
    return formatAgeString(memberData.birth_date);
  }
  if (memberData.ageDescription) return memberData.ageDescription;
  const m = memberData.age_months ?? memberData.ageMonths ?? 0;
  if (m < 12) return `${m} мес.`;
  const y = Math.floor(m / 12);
  const rest = m % 12;
  return rest ? `${y} г. ${rest} мес.` : `${y} ${y === 1 ? "год" : y < 5 ? "года" : "лет"}`;
}

export function getAgeMonths(member: MemberData): number {
  const m = member.age_months ?? member.ageMonths;
  if (m != null && typeof m === "number" && !Number.isNaN(m)) return Math.max(0, m);
  const s = (member.birth_date || "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return 999;
  const { years, months } = calculateAge(s);
  return years * 12 + months;
}

export function normalizeMemberData(raw: MemberData | null | undefined): MemberData | null | undefined {
  if (raw == null) return raw;
  const months = raw.age_months ?? raw.ageMonths;
  let num: number | undefined;
  if (typeof months === "number" && !Number.isNaN(months)) num = Math.max(0, months);
  else if (typeof months === "string") {
    const parsed = parseInt(months, 10);
    num = !Number.isNaN(parsed) ? Math.max(0, parsed) : undefined;
  }
  return { ...raw, age_months: num, ageMonths: num };
}

export function findYoungestMember(members: MemberData[]): MemberData | null {
  if (members.length === 0) return null;
  return members.reduce((youngest, m) =>
    getAgeMonths(m) < getAgeMonths(youngest) ? m : youngest
  , members[0]!);
}

export interface ApplyPromptTemplateOptions {
  userMessage?: string;
  generationContextBlock?: string;
  mealType?: string;
  maxCookingTime?: number;
  servings?: number;
  recentTitleKeysLine?: string;
}

export function applyPromptTemplate(
  template: string,
  memberData: MemberData | null | undefined,
  targetIsFamily: boolean,
  allMembers: MemberData[] = [],
  options?: ApplyPromptTemplateOptions
): string {
  const youngestMember = targetIsFamily && allMembers.length > 0 ? findYoungestMember(allMembers) : null;
  const primaryMember = (targetIsFamily && memberData) ? memberData : (youngestMember ?? memberData);

  const name = (primaryMember?.name ?? "").trim() || "член семьи";
  const targetProfile = targetIsFamily ? "Семья" : name;
  const age = getCalculatedAge(primaryMember) || "не указан";
  const rawMonths = primaryMember ? getAgeMonths(primaryMember) : 0;
  const ageMonths = String(rawMonths === 999 ? 0 : rawMonths);

  let allergiesSet = new Set<string>();
  if (targetIsFamily && allMembers.length > 0) {
    allMembers.forEach((m) => m.allergies?.forEach((a) => allergiesSet.add(a)));
  } else if (primaryMember?.allergies?.length) {
    primaryMember.allergies!.forEach((a) => allergiesSet.add(a));
  }
  const allergies = allergiesSet.size > 0 ? Array.from(allergiesSet).join(", ") : "не указано";
  const allergiesExclude = allergiesSet.size > 0 ? `ИСКЛЮЧИТЬ (аллергия): ${allergies}.` : "";

  let preferencesSet = new Set<string>();
  const addPrefs = (m: MemberData) => {
    const likes = m.likes;
    const prefs = Array.isArray(likes) && likes.length > 0 ? likes : m.preferences;
    prefs?.forEach((p) => p?.trim() && preferencesSet.add(p.trim()));
  };
  if (targetIsFamily && allMembers.length > 0) {
    allMembers.forEach((m) => addPrefs(m));
  } else if (primaryMember) {
    addPrefs(primaryMember);
  }
  const preferencesText = preferencesSet.size > 0 ? Array.from(preferencesSet).join(", ") : "не указано";

  const ageCategory = getAgeCategory(rawMonths === 999 ? 0 : rawMonths);
  const ageRule = ageCategory in AGE_CONTEXTS ? AGE_CONTEXTS[ageCategory as keyof typeof AGE_CONTEXTS] : AGE_CONTEXTS.adult;
  const userMessage = options?.userMessage?.trim() || "";
  const generationContextBlock = options?.generationContextBlock?.trim() || "";
  const mealType = options?.mealType?.trim() || "";
  const maxCookingTime = options?.maxCookingTime != null && Number.isFinite(options.maxCookingTime) ? String(options.maxCookingTime) : "";
  const servings = options?.servings != null && options.servings >= 1 ? String(options.servings) : "1";
  const recentTitleKeysLine = options?.recentTitleKeysLine?.trim() || "";

  let familyContext = `Профиль: ${name}`;
  if (targetIsFamily && allMembers.length > 0) {
    familyContext = getFamilyContextPromptLine();
  } else if (targetIsFamily) {
    familyContext = getFamilyContextPromptLineEmpty();
  }

  let out = template
    .split("{{name}}").join(name)
    .split("{{target_profile}}").join(targetProfile)
    .split("{{age}}").join(age)
    .split("{{ageMonths}}").join(ageMonths)
    .split("{{ageRule}}").join(ageRule)
    .split("{{allergies}}").join(allergies)
    .split("{{allergiesExclude}}").join(allergiesExclude)
    .split("{{preferences}}").join(preferencesText)
    .split("{{generationContextBlock}}").join(generationContextBlock)
    .split("{{familyContext}}").join(familyContext)
    .split("{{userMessage}}").join(userMessage)
    .split("{{mealType}}").join(mealType)
    .split("{{maxCookingTime}}").join(maxCookingTime)
    .split("{{servings}}").join(servings)
    .split("{{recentTitleKeysLine}}").join(recentTitleKeysLine);

  if (out.includes("{{")) {
    const replacers: [RegExp, string][] = [
      [/\{\{\s*name\s*\}\}/g, name],
      [/\{\{\s*target_profile\s*\}\}/g, targetProfile],
      [/\{\{\s*age\s*\}\}/g, age],
      [/\{\{\s*ageMonths\s*\}\}/g, ageMonths],
      [/\{\{\s*ageRule\s*\}\}/g, ageRule],
      [/\{\{\s*allergies\s*\}\}/g, allergies],
      [/\{\{\s*allergiesExclude\s*\}\}/g, allergiesExclude],
      [/\{\{\s*preferences\s*\}\}/g, preferencesText],
      [/\{\{\s*generationContextBlock\s*\}\}/g, generationContextBlock],
      [/\{\{\s*familyContext\s*\}\}/g, familyContext],
      [/\{\{\s*userMessage\s*\}\}/g, userMessage],
      [/\{\{\s*mealType\s*\}\}/g, mealType],
      [/\{\{\s*maxCookingTime\s*\}\}/g, maxCookingTime],
      [/\{\{\s*servings\s*\}\}/g, servings],
      [/\{\{\s*recentTitleKeysLine\s*\}\}/g, recentTitleKeysLine],
    ];
    for (const [re, val] of replacers) out = out.replace(re, val);
    out = out.replace(/\{\{[^}]*\}\}/g, "не указано");
  }
  return out;
}

function generateChatSystemPrompt(
  isPremium: boolean,
  memberData: MemberData | null | undefined,
  targetIsFamily: boolean,
  allMembers: MemberData[] = [],
  options?: ApplyPromptTemplateOptions
): string {
  const template = isPremium ? PREMIUM_RECIPE_TEMPLATE : FREE_RECIPE_TEMPLATE;
  return applyPromptTemplate(template, memberData, targetIsFamily, allMembers, options);
}

export interface RecipePromptV3Options {
  mealType?: string;
  maxCookingTime?: number;
  servings?: number;
  /** Уже ограниченная строка (например до 5 тайтлов). Формат: "Не повторяй: title1, title2, ..." */
  recentTitleKeysLine?: string;
}

/**
 * Компактный system prompt для recipe-path (chat/recipe при isRecipeRequest).
 * Не добавляет generationContextBlock. Контекст минимальный.
 */
export function generateRecipeSystemPromptV3(
  memberData: MemberData | null | undefined,
  isPremium: boolean,
  targetIsFamily: boolean,
  allMembers: MemberData[] = [],
  options?: RecipePromptV3Options
): string {
  const primaryMember = (targetIsFamily && allMembers.length > 0)
    ? findYoungestMember(allMembers)
    : memberData;
  const name = (primaryMember?.name ?? "").trim() || "член семьи";
  const targetProfile = targetIsFamily ? "Семья" : name;
  const rawMonths = primaryMember ? getAgeMonths(primaryMember) : 0;
  const ageMonths = String(rawMonths === 999 ? 0 : rawMonths);
  const ageCategory = getAgeCategory(rawMonths === 999 ? 0 : rawMonths);
  const ageRule = AGE_CONTEXTS_SHORT[ageCategory] ?? AGE_CONTEXTS_SHORT.adult ?? "";

  const allergiesSet = new Set<string>();
  const dislikesSet = new Set<string>();
  const likesSet = new Set<string>();
  const members = targetIsFamily && allMembers.length > 0 ? allMembers : (primaryMember ? [primaryMember] : []);
  members.forEach((m) => {
    m.allergies?.forEach((a) => allergiesSet.add(a));
    (m as MemberData).dislikes?.forEach((d) => d?.trim() && dislikesSet.add(d.trim()));
    m.likes?.forEach((l) => l?.trim() && likesSet.add(l.trim()));
  });
  const allergiesExclude = allergiesSet.size > 0 ? `ИСКЛЮЧИТЬ (аллергия): ${Array.from(allergiesSet).join(", ")}.` : "";
  const dislikesLine = dislikesSet.size > 0 ? `ИСКЛЮЧИТЬ (не любят): ${Array.from(dislikesSet).join(", ")}.` : "";
  const likesLine = likesSet.size > 0 ? `SOFT likes: ${Array.from(likesSet).join(", ")}.` : "";

  const mealType = options?.mealType?.trim() ?? "";
  const maxCookingTime = options?.maxCookingTime != null && Number.isFinite(options.maxCookingTime) ? String(options.maxCookingTime) : "";
  const servings = options?.servings != null && options.servings >= 1 ? String(options.servings) : "1";
  const recentLine = options?.recentTitleKeysLine?.trim() ?? "";

  const role = isPremium ? "Ты — Шеф-нутрициолог Mom Recipes (Premium)." : "Ты — ИИ Mom Recipes (Free). Выдай 1 рецепт.";
  const contextLines: string[] = [
    `Профиль: ${targetProfile}. ${ageRule} ВОЗРАСТ_МЕС: ${ageMonths}.`,
    allergiesExclude,
    dislikesLine,
  ].filter(Boolean);
  if (likesLine) contextLines.push(likesLine);
  contextLines.push(`mealType: ${mealType || "—"}. Макс. мин: ${maxCookingTime || "—"}. Порций: ${servings}.`);
  if (recentLine) contextLines.push(recentLine);

  return `${role}

[CONTEXT]
${contextLines.join("\n")}

${MEAL_SOUP_RULES.trim()}

${RECIPE_SYSTEM_RULES_V3.trim()}`;
}

export function getSystemPromptForType(
  type: string,
  memberData: MemberData | null | undefined,
  isPremium: boolean,
  targetIsFamily: boolean,
  allMembers: MemberData[] = [],
  userMessage?: string,
  generationContextBlock?: string,
  mealType?: string,
  maxCookingTime?: number,
  servings?: number,
  recentTitleKeysLine?: string
): string {
  const genBlockOpt = generationContextBlock?.trim() ? { generationContextBlock: generationContextBlock.trim() } : undefined;
  const recipeOpts: ApplyPromptTemplateOptions = {
    ...genBlockOpt,
    ...(mealType && { mealType: String(mealType).trim() }),
    ...(maxCookingTime != null && Number.isFinite(maxCookingTime) && { maxCookingTime: Number(maxCookingTime) }),
    servings: servings != null && servings >= 1 ? servings : 1,
    recentTitleKeysLine: recentTitleKeysLine?.trim() ?? "",
  };
  if (type === "chat") {
    return generateChatSystemPrompt(isPremium, memberData, targetIsFamily, allMembers, recipeOpts);
  }
  if (type === "recipe") {
    const template = isPremium ? PREMIUM_RECIPE_TEMPLATE : FREE_RECIPE_TEMPLATE;
    return applyPromptTemplate(template, memberData, targetIsFamily, allMembers, recipeOpts);
  }
  if (type === "sos_consultant") {
    return applyPromptTemplate(SOS_PROMPT_TEMPLATE, memberData, false, allMembers, { userMessage: userMessage || "" });
  }
  if (type === "balance_check") {
    return applyPromptTemplate(BALANCE_CHECK_TEMPLATE, memberData, false, allMembers, { userMessage: userMessage || "" });
  }
  return "Ты — помощник. Отвечай кратко и по делу.";
}
