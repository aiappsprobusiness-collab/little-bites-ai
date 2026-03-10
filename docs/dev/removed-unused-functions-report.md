# Отчёт: удаление неиспользуемых Edge Functions и связанного кода

## Что удалено

### 1. Edge Functions (папки в репо)

| Функция | Путь | Действие |
|--------|------|----------|
| speech-to-text | `supabase/functions/speech-to-text/index.ts` | Файл удалён (папка пустая) |
| deepseek-speech-to-text | `supabase/functions/deepseek-speech-to-text/index.ts` | Файл удалён |
| generate-recipe-image | `supabase/functions/generate-recipe-image/index.ts` | Файл удалён |
| deepseek-analyze | `supabase/functions/deepseek-analyze/index.ts` | Файл удалён |

В Supabase Dashboard эти функции останутся до ручного удаления или до следующего деплоя (их уже не будет в репо, поэтому заново задеплоить их нельзя).

---

### 2. Конфигурация

- **supabase/config.toml** — удалены секции:
  - `[functions.deepseek-analyze]`
  - `[functions.generate-recipe-image]`

---

### 3. Фронт и хуки

| Место | Что сделано | Безопасность |
|-------|-------------|---------------|
| **src/services/speechToText.ts** | Файл удалён целиком | ✅ Безопасно. Файл нигде не импортировался. Все экраны используют `speechToTextEnhanced` (Web Speech / Android). Дубликаты утилит `audioFileToBase64`, `mediaRecorderToBase64`, `isSpeechToTextConfigured` есть в `speechToTextEnhanced.ts`. |
| **src/hooks/useDeepSeekAPI.tsx** | Удалены мутация `analyzeMutation` (вызов `POST …/deepseek-analyze`), а также экспорты `analyze`, `isAnalyzing`, `analyzeError` из возвращаемого объекта | ✅ Безопасно. Ни один компонент не вызывал `useDeepSeekAPI().analyze` или не использовал `isAnalyzing` / `analyzeError`. Сканер и «Анализ тарелки» используют другие пути (useDeepSeek + deepseek-chat, FoodDiary → deepseek-chat). |

---

### 4. Документация

- **docs/architecture/chat_recipe_generation.md** — из списка Edge Functions убраны: deepseek-speech-to-text, speech-to-text, deepseek-analyze, generate-recipe-image.
- **docs/dev/unused-edge-functions.md** — добавлена секция «Выполнено (удалено)».
- **SPEECH_TO_TEXT_SETUP.md** — в начало добавлена пометка: «Устарело. Edge Function speech-to-text удалена…» (файл оставлен для истории).

---

## Где был «старый» код и можно ли было удалять

| Код | Где был | Удалять? | Как удалено |
|-----|---------|----------|-------------|
| Вызов `deepseek-speech-to-text` | `src/services/speechToText.ts` → `transcribeAudio()` | Да | Файл `speechToText.ts` удалён. `transcribeAudio()` нигде не вызывалась. |
| Вызов `deepseek-analyze` | `src/hooks/useDeepSeekAPI.tsx` → `analyzeMutation` | Да | Мутация и экспорты `analyze` / `isAnalyzing` / `analyzeError` удалены. Ни один компонент их не использовал. |
| Вызов `speech-to-text` | Нигде в `src` не было | — | Только Edge Function удалена. |
| Вызов `generate-recipe-image` | Нигде в `src` не было | — | Только Edge Function удалена. |
| `audioFileToBase64`, `mediaRecorderToBase64`, `isSpeechToTextConfigured` из speechToText | `src/services/speechToText.ts` | Да, вместе с файлом | Те же имена и логика есть в `speechToTextEnhanced.ts`; импортов из `speechToText.ts` не было. |

---

## Что не трогали (намеренно)

- **check_usage_limit** (RPC в БД) — использовался в `deepseek-analyze`; мог использоваться где-то ещё. Не удаляли.
- **useDeepSeek** и **ScanPage** — используют `deepseek.ts` и **deepseek-chat** (vision). Не изменялись.
- **FoodDiary** — вызывает **deepseek-chat** с `type: "balance_check"`. Не изменялся.
- **SPEECH_TO_TEXT_SETUP.md** — не удалён, добавлена пометка «Устарело».

---

## Рекомендация по Supabase Dashboard

В **Supabase Dashboard → Edge Functions** можно вручную удалить функции `speech-to-text`, `deepseek-speech-to-text`, `generate-recipe-image`, `deepseek-analyze`, чтобы они не висели в списке и не учитывались в лимитах (если применимо).
