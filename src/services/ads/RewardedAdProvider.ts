/**
 * Интерфейс rewarded-рекламы: показ перед второй генерацией в день (Free).
 */

export interface IRewardedAdProvider {
  /** Доступна ли реклама к показу */
  isAvailable(): boolean | Promise<boolean>;
  /** Показать рекламу. Resolve при успешном просмотре (reward), reject при отмене/ошибке */
  show(): Promise<void>;
}
