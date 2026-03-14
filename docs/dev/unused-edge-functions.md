# Неиспользуемые Edge Functions

Отчёт: какие функции не вызываются из приложения и могут быть удалены.

---

## 1. `speech-to-text` (OpenAI Whisper)

- **Назначение:** распознавание речи через OpenAI Whisper API (аудио → текст).
- **В коде:** нигде не вызывается. В приложении используется **speechToTextEnhanced** (Web Speech API в браузере, нативный распознаватель на Android).
- **Файл `src/services/speechToText.ts`:** экспортирует `transcribeAudio()`, но эта функция **ни разу не импортируется** в проекте.
- **Последнее изменение в репо:** 2026-02-12 (feat: JSON recipe contract, favorites v2…).

**Вывод:** можно удалить функцию `speech-to-text` и при желании — сервис `speechToText.ts` (или оставить только как мёртвый код до рефактора).

---

## 2. `deepseek-speech-to-text`

- **Назначение:** распознавание речи через DeepSeek (аудио → текст). В коде есть комментарий, что DeepSeek не поддерживает аудио, и ожидается fallback.
- **В коде:** вызывается **только** из `src/services/speechToText.ts` в `transcribeAudio()`. Сама `transcribeAudio()` нигде не вызывается — все экраны используют `speechToTextEnhanced`.
- **Последнее изменение в репо:** 2026-02-12.

**Вывод:** можно удалить функцию `deepseek-speech-to-text`. После этого вызов из `speechToText.ts` станет невалидным; файл `speechToText.ts` можно удалить или переписать под один путь (например, только Enhanced).

---

## 3. `generate-recipe-image`

- **Назначение:** генерация картинки к рецепту через Lovable AI (recipeId, recipeName → image).
- **В коде:** в `src` нет ни одного вызова этой функции (нет `generate-recipe-image`, `generateRecipeImage`, fetch на этот URL).
- **Последнее изменение в репо:** 2026-03-05 (vrode rabotaet lol).

**Вывод:** функция не используется. Можно удалить Edge Function. Если планируется «картинка к рецепту» — вызов нужно добавить во фронт; иначе удалить и не деплоить.

---

## 4. `deepseek-analyze`

- **Назначение:** анализ изображения (холодильник/тарелка) через Lovable AI (Gemini): поиск продуктов на фото, ответ в JSON.
- **В коде:** вызывается только из **useDeepSeekAPI**: `analyzeMutation` дергает `POST …/deepseek-analyze`. Но **ни один компонент не использует** `analyze` / `isAnalyzing` из `useDeepSeekAPI()`.  
  - **Наша тарелка (Анализ тарелки):** `FoodDiary.tsx` вызывает **deepseek-chat** с `type: "balance_check"` и текстом, не изображением.  
  - **Сканер (ScanPage):** использует **useDeepSeek().analyzeImage()** → `deepseek.ts` → **deepseek-chat** (vision) или текстовый fallback, не deepseek-analyze.
- **Последнее изменение в репо:** 2026-02-12.

**Вывод:** `deepseek-analyze` в проде не используется. Можно удалить Edge Function и при желании убрать из **useDeepSeekAPI** мутацию `analyzeMutation` и экспорты `analyze` / `isAnalyzing` / `analyzeError` (очистка мёртвого кода).

---

## Итог

| Функция                   | Используется? | Рекомендация        |
|---------------------------|--------------|----------------------|
| speech-to-text            | Нет          | Удалить функцию      |
| deepseek-speech-to-text   | Нет          | Удалить функцию      |
| generate-recipe-image     | Нет          | Удалить функцию      |
| deepseek-analyze          | Нет          | Удалить функцию      |

---

## Выполнено (удалено)

- **Edge Functions:** удалены папки и `index.ts`: `speech-to-text`, `deepseek-speech-to-text`, `generate-recipe-image`, `deepseek-analyze`.
- **supabase/config.toml:** убраны секции `[functions.deepseek-analyze]` и `[functions.generate-recipe-image]`.
- **src/services/speechToText.ts:** файл удалён целиком (вызывал только удалённую функцию, нигде не импортировался).
- **src/hooks/useDeepSeekAPI.tsx:** удалены мутация `analyzeMutation`, вызов `deepseek-analyze` и экспорты `analyze`, `isAnalyzing`, `analyzeError`.
- **docs/architecture/chat_recipe_generation.md:** из списка функций убраны упоминания удалённых четырёх.
- **SPEECH_TO_TEXT_SETUP.md:** в начало добавлена пометка «Устарело».

В Supabase Dashboard функции можно удалить вручную (или они перестанут деплоиться при следующем push).
