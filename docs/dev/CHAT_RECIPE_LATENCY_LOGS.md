# Логи латентности chat-рецепта (deepseek-chat)

Краткий справочник полей для разбора «основной LLM vs repair описания» и причин отказа quality gate по `description`.

## PERF

| `step` | Смысл |
|--------|--------|
| `llm_body` | Время чтения тела ответа основного запроса (после получения `Response`). |
| `llm_total` | Полный round-trip основного вызова DeepSeek от старта запроса до конца разбора тела. |
| `llm_main_ms` | То же по смыслу, что `llm_total` для данного запроса — явный алиас для дашбордов (основной чат-комплишн). |
| `llm_description_repair_ms` | Только второй вызов API в `repairChatRecipeDescription` (если сырой текст не прошёл gate и есть API key). |

## LATENCY_AUDIT

В конце успешного ответа, помимо `total_ms` и `latencyPhase`:

- **`llm_main_ms`** — длительность основного DeepSeek (мс), если замер выполнен.
- **`llm_description_repair_ms`** — длительность repair-вызова (мс), только если repair реально вызывался; иначе поле отсутствует.

## DESCRIPTION_QUALITY_GATE_RAW_LLM

Пишется, когда **сырой** `validated.description` не проходит `passesDescriptionQualityGate` (до `resolveChatRecipeCanonicalDescription`).

Дополнительные поля для корреляций:

- `rejection_reason_raw` — код/строка из `explainCanonicalDescriptionRejection`.
- `title_len`, `desc_len`
- `meal_type`, `meal_type_for_prompt`, `simple_meal_only_query`
- `subscription_status`
- `advice_ok`, `raw_chef_advice_nonempty`
- `dish_type_hint` — эвристика `detectDescriptionDishType` по title/ингредиентам/mealType.

## DESCRIPTION_GATE_SUMMARY

Один строковый JSON после пайплайна канона описания: итоговый `canonical_description_source` (`llm_raw` | `llm_repair` | `emergency_fallback`), причины отказов, `repair_llm_ms`, те же контекстные поля плюс `desc_len_sanitized_input` (длина текста на входе в resolve), `chef_advice_saved`, `quality_retry_skipped_due_to_advice_failure`.

Существующие теги `DESCRIPTION_PIPELINE_*` не менялись.
