/**
 * Feature flag: автозаполнение плана дня после создания нового члена семьи (онбординг).
 * По умолчанию в dev — true, если env не задан.
 */
export const FF_AUTO_FILL_AFTER_MEMBER_CREATE =
  import.meta.env.VITE_FF_AUTO_FILL_AFTER_MEMBER_CREATE === "true" ||
  (import.meta.env.DEV && import.meta.env.VITE_FF_AUTO_FILL_AFTER_MEMBER_CREATE !== "false");

/**
 * Paywall с preview недели: при клике «Заполнить неделю (доступно с Premium)» открывать bottom sheet
 * с превью одного дня + 6 залоченных. При выключении — старое поведение (тост/пейвол без preview).
 */
export const FF_WEEK_PAYWALL_PREVIEW =
  import.meta.env.VITE_FF_WEEK_PAYWALL_PREVIEW === "true" ||
  (import.meta.env.DEV && import.meta.env.VITE_FF_WEEK_PAYWALL_PREVIEW !== "false");

