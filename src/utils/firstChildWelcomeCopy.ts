import type { User } from "@supabase/supabase-js";

export const NEW_CHILD_PROFILE_TITLE = "Профиль ребёнка";
export const CHILD_NAME_LABEL = "Имя ребёнка";
export const CHILD_NAME_PLACEHOLDER = "Например: Маша";

export const FIRST_CHILD_WELCOME_BODY =
  "Заполните профиль ребёнка — мы учтём возраст и особенности ребенка, чтобы подбирать рецепты и меню без лишней суеты.";

export function getMotherDisplayName(user: User | null | undefined): string | null {
  const name = (user?.user_metadata?.display_name as string | undefined)?.trim();
  return name || null;
}

export function getFirstChildWelcomeHeadline(user: User | null | undefined): string {
  const name = getMotherDisplayName(user);
  if (name) return `${name}, рады вас видеть!`;
  return "Рады, что вы с нами!";
}
