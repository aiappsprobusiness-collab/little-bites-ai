/** Free: одна отправка в дневник тарелки за сутки (локально, UTC-день как у usage_events). */

const KEY = "food_diary_free_send_day";

function todayUtcKey(): string {
  return new Date().toISOString().slice(0, 10);
}

export function hasUsedFoodDiaryFreeSendToday(): boolean {
  if (typeof localStorage === "undefined") return false;
  return localStorage.getItem(KEY) === todayUtcKey();
}

export function markFoodDiaryFreeSendToday(): void {
  if (typeof localStorage === "undefined") return;
  localStorage.setItem(KEY, todayUtcKey());
}

export function canSendFoodDiaryAsFree(hasAccess: boolean): boolean {
  return hasAccess || !hasUsedFoodDiaryFreeSendToday();
}
