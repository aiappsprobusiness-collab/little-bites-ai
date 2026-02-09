import { MobileLayout } from "@/components/layout/MobileLayout";

export default function Terms() {
  return (
    <MobileLayout>
      <div className="legal-page mx-auto max-w-[720px] px-4 py-8 text-foreground space-y-6">
        <h1 className="text-2xl font-bold">Пользовательское соглашение</h1>

        <p>
          Настоящее Пользовательское соглашение регулирует отношения между
          Индивидуальным предпринимателем Ивановым Дмитрием Владимировичем
          (ОГРНИП 326310000006739, ИНН 312730999383), далее — «Исполнитель», и
          Пользователем сервиса Mom Recipes.
        </p>

        <h2 className="text-typo-title font-semibold mt-6">1. Общие положения</h2>
        <p>
          Mom Recipes — это сервис с использованием искусственного интеллекта для
          генерации рецептов для детей и семьи.
        </p>

        <h2 className="text-typo-title font-semibold mt-6">2. Регистрация и использование</h2>
        <p>
          Пользователь может использовать вымышленные данные профилей детей и
          семьи. Ответственность за корректность вводимых данных лежит на
          Пользователе.
        </p>

        <h2 className="text-typo-title font-semibold mt-6">3. Подписка</h2>
        <p>
          Бесплатная версия ограничена. Полный функционал доступен по подписке
          Premium (месяц / год / trial 3 дня).
        </p>

        <h2 className="text-typo-title font-semibold mt-6">4. Ответственность</h2>
        <p>
          Рецепты носят рекомендательный характер и не являются медицинскими или
          диетологическими предписаниями.
        </p>

        <h2 className="text-typo-title font-semibold mt-6">5. Контакты</h2>
        <p>
          Исполнитель: ИП Иванов Дмитрий Владимирович<br />
          Юр. адрес: 309181, Россия, Белгородская обл., г. Губкин, ул. Кирова, д. 67А,
          кв. 73<br />
          Email: <a href="mailto:aiapps.probusiness@gmail.com" className="underline text-primary">aiapps.probusiness@gmail.com</a>
        </p>
      </div>
    </MobileLayout>
  );
}
