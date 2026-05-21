import { TRIAL_DURATION_DAYS } from "@/utils/subscriptionRules";

export type PostValueTrialPromptVariant = "plan_only" | "plan_and_chat";

export type PostValueTrialPromptCopy = {
  title: string;
  body: string;
};

function trialDaysPhrase(): string {
  const d = TRIAL_DURATION_DAYS;
  const word = d === 1 ? "день" : d >= 2 && d <= 4 ? "дня" : "дней";
  return `${d} ${word}`;
}

const TRIAL_FOOTER = `Полная версия — ${trialDaysPhrase()} бесплатно: замена блюд, план на неделю и больше подборов каждый день.`;

export function getPostValueTrialPromptCopy(variant: PostValueTrialPromptVariant): PostValueTrialPromptCopy {
  if (variant === "plan_and_chat") {
    return {
      title: "Уже есть меню и рецепт — отличное начало",
      body: `Вы уже получили меню на день для ребёнка и подобрали рецепт в чате.\n\n${TRIAL_FOOTER}`,
    };
  }
  return {
    title: "Меню на сегодня готово",
    body: `Мы собрали план питания на день с учётом возраста и аллергий.\n\n${TRIAL_FOOTER}`,
  };
}
