/**
 * Feature flag: автозаполнение плана дня после создания нового члена семьи (онбординг).
 * По умолчанию включено (dev и prod); выключить: VITE_FF_AUTO_FILL_AFTER_MEMBER_CREATE=false.
 */
export const FF_AUTO_FILL_AFTER_MEMBER_CREATE =
  import.meta.env.VITE_FF_AUTO_FILL_AFTER_MEMBER_CREATE !== "false";

/**
 * Paywall с preview недели: при клике «Заполнить неделю (доступно с Premium)» открывать bottom sheet
 * с превью одного дня + 6 залоченных. По умолчанию включено (dev и prod); выключить: VITE_FF_WEEK_PAYWALL_PREVIEW=false.
 */
export const FF_WEEK_PAYWALL_PREVIEW =
  import.meta.env.VITE_FF_WEEK_PAYWALL_PREVIEW !== "false";

/**
 * Единый paywall (один UI и тексты для всех точек входа Premium).
 * По умолчанию включён. Откат на контекстный legacy-paywall: `VITE_FF_UNIFIED_PAYWALL=false`.
 */
export const FF_UNIFIED_PAYWALL = import.meta.env.VITE_FF_UNIFIED_PAYWALL !== "false";

