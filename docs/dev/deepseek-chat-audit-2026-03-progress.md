# Deepseek-chat audit — Stage B+C progress (2026-03-22)

Отчёт по выполнению **Stage B** (сжатие промпта `chefAdvice`) и **Stage C** (синхронизация требований к `description` с `passesDescriptionQualityGate`) из [`deepseek-chat-audit-2026-03-description-and-token-reduction.md`](./deepseek-chat-audit-2026-03-description-and-token-reduction.md).

---

## 1. Изменённые файлы

| Файл |
|------|
| `supabase/functions/deepseek-chat/prompts.ts` |
| `supabase/functions/deepseek-chat/domain/recipe_io/sanitizeAndRepair.ts` |
| `supabase/functions/deepseek-chat/domain/recipe_io/chefAdviceQuality.ts` (комментарий к `CHEF_ADVICE_MAX_LENGTH`) |
| `supabase/functions/deepseek-chat/domain/recipe_io/index.ts` (реэкспорт констант) |
| `supabase/functions/deepseek-chat/recipeSchema.ts` (комментарий + текст сообщения Zod для `description`) |
| `supabase/functions/deepseek-chat/index.ts` (лог `SENDING PAYLOAD_META`) |
| `supabase/functions/deepseek-chat/domain/recipe_io/recipe_io.test.ts` |
| `supabase/functions/deepseek-chat/buildPrompt.test.ts` |
| `docs/architecture/system-prompts-map.md` |
| `docs/architecture/chat_recipe_generation.md` |
| `docs/refactor/recipe-core-multilang-progress.md` |
| `docs/dev/deepseek-chat-audit-2026-03-progress.md` (этот файл) |

**Не менялись:** миграции БД, allergy/dislike blocking, CMPA-правила, `MEAL_SOUP_RULES`, запись `chat_history`, клиентский фронт.

---

## 2. Краткий summary

- **`CHEF_ADVICE_RULES`:** убраны многострочные good/bad примеры и повторяющиеся абзацы; остались короткие жёсткие правила, согласованные с пост-обработкой (`chefAdviceQuality.ts`, `enforceChefAdvice` → `null` без заглушек). В промпте явно указан лимит **`CHEF_ADVICE_MAX_LENGTH` (160)**.
- **`description`:** единый источник чисел для промпта и гейта — константы **`DESCRIPTION_QUALITY_MIN_LENGTH` (38)**, **`DESCRIPTION_MAX_LENGTH` (210)**, **`DESCRIPTION_QUALITY_TWO_SENTENCE_MIN_LENGTH` (45)** в `sanitizeAndRepair.ts`; `prompts.ts` импортирует их в **`RECIPE_SYSTEM_RULES_V3`** и обновлённый справочный **`RECIPE_STRICT_JSON_CONTRACT`**.
- **`RECIPE_STRICT_JSON_CONTRACT`:** помечен в коде как справочный (не в hot path V3); текст контракта приведён к тем же лимитам, что и гейт.
- **`isDescriptionInvalid`:** верхняя граница длины **210** (`DESCRIPTION_MAX_LENGTH`), вместо устаревших 180.
- **Логи:** вместо полного тела запроса к DeepSeek — **`SENDING PAYLOAD_META`** (model, max_tokens, длины system/user, число сообщений).

---

## 3. Что реально сократилось по токенам / объёму

- В каждом recipe-запросе короче **system prompt** за счёт **сжатого `CHEF_ADVICE_RULES`** (десятки строк примеров и повторов убраны).
- **Меньше дублирования** «промпт говорит одно, гейт проверяет другое» — модель получает целевой диапазон **38–210** и правило **≥45** для двух предложений; это не увеличивает лимит ответа, но убирает устаревший ориентир «макс. 160».

---

## 4. Почему это должно снизить частоту fallback по `description`

- Раньше промпт подталкивал к **короткому** описанию (~160 симв.) при том, что гейт требует **минимум 38** и для **двух** предложений **≥45** симв.; модель могла формально «следовать промпту» и всё равно **не пройти** гейт (или чаще оказываться на нижней границе с риском срыва после санитайзеров).
- Теперь инструкции в **V3** совпадают с **`passesDescriptionQualityGate`**, поэтому ожидается меньше отклонений с причинами вроде **`length_out_of_range`** / **`too_short_for_two_sentences`** из‑за рассинхрона с текстом промпта. **Fallback `buildRecipeBenefitDescription` сохранён** как safety net; штампы, leak, title-dup, маркеры — без ослабления.

---

## 5. Как проверить вручную

1. **Тесты Edge (Deno):** из каталога `supabase/functions`:
   ```bash
   deno test deepseek-chat/buildPrompt.test.ts deepseek-chat/domain/recipe_io/recipe_io.test.ts deepseek-chat/domain/recipe_io/chefAdviceQuality.test.ts --allow-read
   ```
   Либо из корня репозитория: `npm run test:edge` (включает те же и другие тесты).
2. **Smoke чат:** сгенерировать несколько рецептов (1–2 предложения в карточке, разные mealType); убедиться, что описание осмысленное, нет массового перехода на один и тот же benefit-текст.
3. **Логи:** при отладке искать **`SENDING PAYLOAD_META`**, а не полный payload; при **`CHAT_DESCRIPTION_DEBUG=true`** смотреть `rejection_reason` при fallback описания.

---

## 6. Деплой

- Изменены только **Edge Function `deepseek-chat`**, тесты и **документация**. Фронт деплоить **не нужно**.
- Применение: задеплоить функцию через Supabase CLI, например:
  ```bash
  npm run supabase:deploy:chat
  ```
  (или эквивалентный скрипт проекта для `deepseek-chat`).

---

## Примечание об окружении

На машине, где выполнялась задача, **Deno не был в PATH**; тесты нужно прогнать локально/в CI по командам выше.
