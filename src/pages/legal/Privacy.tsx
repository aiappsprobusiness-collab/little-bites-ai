import { MobileLayout } from "@/components/layout/MobileLayout";

export default function Privacy() {
  return (
    <MobileLayout>
      <div className="legal-page mx-auto max-w-[720px] px-4 py-8 text-foreground space-y-6">
        <h1 className="text-2xl font-bold">Политика конфиденциальности</h1>

        <p>
          Настоящая Политика описывает, как Mom Recipes обрабатывает данные
          Пользователей.
        </p>

        <h2 className="text-typo-title font-semibold mt-6">1. Какие данные мы собираем</h2>
        <p>
          Имя, возраст, предпочтения и аллергии профилей семьи. Эти данные могут
          быть вымышленными и используются только для генерации рецептов.
        </p>

        <h2 className="text-typo-title font-semibold mt-6">2. Как используются данные</h2>
        <p>
          Данные используются исключительно для персонализации рецептов и работы
          сервиса.
        </p>

        <h2 className="text-typo-title font-semibold mt-6">3. Передача данных</h2>
        <p>
          Мы не передаём данные третьим лицам, кроме технических сервисов
          (платёжные и облачные провайдеры).
        </p>

        <h2 className="text-typo-title font-semibold mt-6">4. Контакты</h2>
        <p>
          Исполнитель: ИП Иванов Дмитрий Владимирович<br />
          Email: <a href="mailto:aiapps.probusiness@gmail.com" className="underline text-primary">aiapps.probusiness@gmail.com</a>
        </p>
      </div>
    </MobileLayout>
  );
}
