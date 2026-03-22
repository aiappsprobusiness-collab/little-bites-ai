# Infant AI recipe path — снят с поддержки

Ранее существовал отдельный LLM-поток для рецептов 6–11 мес (`infantRecipe*`, `infantSafetyValidator`, и т.д.). **Сейчас AI-рецепты в чате для детей до 12 месяцев не генерируются.**

**Актуальное поведение:** см. **`docs/architecture/chat_recipe_generation.md`** — ветка **`under_12_curated_block`**, константы и payload в **`supabase/functions/deepseek-chat/domain/recipe_generation/recipeGenerationRouting.ts`**.
