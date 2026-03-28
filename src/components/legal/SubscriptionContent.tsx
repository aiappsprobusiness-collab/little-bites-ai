import { LEGAL_DOCUMENT_BODY_CLASS } from "./legalDocumentBodyClass";

export function SubscriptionContent() {
  return (
    <div className={LEGAL_DOCUMENT_BODY_CLASS}>
      <h1>Условия подписки</h1>

      <h2>1. Тарифы</h2>
      <p>
        Premium-подписка предоставляет доступ ко всем функциям Mom Recipes:
        семейный режим, персонализация, секреты шефа и т.д.
      </p>

      <h2>2. Trial</h2>
      <p>
        Доступен бесплатный trial-период 3 дня с полным функционалом Premium.
      </p>

      <h2>3. Оплата</h2>
      <p>
        Оплата производится помесячно или ежегодно через эквайринг Т-Бизнес
        (Тинькофф).
      </p>

      <h2>4. Отмена и возврат</h2>
      <p>
        Пользователь может отменить подписку в любой момент в личном кабинете.
        Возврат возможен в течение 24 часов после первой оплаты при условии, что
        сервис не использовался.
      </p>

      <h2>5. Контакты</h2>
      <p>
        Email для поддержки:{" "}
        <a href="mailto:aiapps.probusiness@gmail.com">aiapps.probusiness@gmail.com</a>
      </p>
    </div>
  );
}
