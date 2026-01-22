/**
 * Утилиты для парсинга рецептов из ответов AI в чате
 */

export interface ParsedRecipe {
  title: string;
  description?: string;
  ingredients: string[];
  steps: string[];
  cookingTime?: number;
  mealType?: 'breakfast' | 'lunch' | 'snack' | 'dinner';
}

/**
 * Определяет тип приема пищи из текста запроса или ответа
 */
export function detectMealType(text: string): 'breakfast' | 'lunch' | 'snack' | 'dinner' | undefined {
  if (!text) return undefined;

  const lowerText = text.toLowerCase();

  // Завтрак - приоритетные ключевые слова
  if (
    lowerText.includes('завтрак') ||
    lowerText.includes('breakfast') ||
    lowerText.includes('утром') ||
    lowerText.includes('утренний') ||
    lowerText.includes('на завтрак') ||
    lowerText.includes('для завтрака')
  ) {
    return 'breakfast';
  }

  // Обед
  if (
    lowerText.includes('обед') ||
    lowerText.includes('lunch') ||
    lowerText.includes('в обед') ||
    lowerText.includes('обеденный') ||
    lowerText.includes('на обед') ||
    lowerText.includes('для обеда')
  ) {
    return 'lunch';
  }

  // Полдник
  if (
    lowerText.includes('полдник') ||
    lowerText.includes('snack') ||
    lowerText.includes('перекус') ||
    lowerText.includes('на полдник') ||
    lowerText.includes('для полдника')
  ) {
    return 'snack';
  }

  // Ужин
  if (
    lowerText.includes('ужин') ||
    lowerText.includes('dinner') ||
    lowerText.includes('вечером') ||
    lowerText.includes('вечерний') ||
    lowerText.includes('на ужин') ||
    lowerText.includes('для ужина')
  ) {
    return 'dinner';
  }

  return undefined;
}

/**
 * Парсит рецепты из ответа AI
 * Ищет структурированные рецепты в формате JSON или текстовом формате
 */
export function parseRecipesFromChat(
  userMessage: string,
  aiResponse: string
): ParsedRecipe[] {
  console.log('parseRecipesFromChat - Starting parse', {
    userMessageLength: userMessage.length,
    aiResponseLength: aiResponse.length,
    userMessage: userMessage.substring(0, 100),
    aiResponse: aiResponse.substring(0, 200),
  });

  const recipes: ParsedRecipe[] = [];
  const mealType = detectMealType(userMessage) || detectMealType(aiResponse);

  console.log('parseRecipesFromChat - Detected meal type:', mealType);

  // Попытка найти JSON в ответе (ищем более гибко)
  let jsonMatch = null;
  let jsonString = null;

  // Сначала пробуем найти JSON в code blocks
  const codeBlockMatch = aiResponse.match(/```(?:json)?\s*(\{[\s\S]*?\})\s*```/);
  if (codeBlockMatch && codeBlockMatch[1]) {
    jsonString = codeBlockMatch[1];
    console.log('parseRecipesFromChat - Found JSON in code block');
  } else {
    // Если не нашли в code block, ищем обычный JSON объект
    const simpleMatch = aiResponse.match(/\{[\s\S]*\}/);
    if (simpleMatch) {
      jsonString = simpleMatch[0];
      console.log('parseRecipesFromChat - Found JSON object');
    }
  }

  if (jsonString) {
    try {
      const parsed = JSON.parse(jsonString);

      // Если это один рецепт
      if (parsed.title || parsed.name) {
        const title = parsed.title || parsed.name;
        // Проверяем, что название валидное (не дефолтное и не пустое)
        if (title && title.trim() && title !== 'Рецепт из чата' && title.length >= 3 && title.length <= 60) {
          const ingredients = Array.isArray(parsed.ingredients)
            ? parsed.ingredients
            : parsed.ingredients?.split(',').map((i: string) => i.trim()) || [];
          const steps = Array.isArray(parsed.steps)
            ? parsed.steps
            : parsed.steps?.split('\n').filter((s: string) => s.trim()) || [];

          // Сохраняем только если есть хотя бы ингредиенты или шаги
          if (ingredients.length > 0 || steps.length > 0) {
            recipes.push({
              title: title.trim(),
              description: parsed.description || parsed.desc,
              ingredients,
              steps,
              cookingTime: parsed.cookingTime || parsed.cooking_time || parsed.time,
              mealType,
            });
          }
        }
      }

      // Если это массив рецептов
      if (Array.isArray(parsed) || Array.isArray(parsed.recipes)) {
        const recipeList = Array.isArray(parsed) ? parsed : parsed.recipes;
        recipeList.forEach((recipe: any) => {
          const title = recipe.title || recipe.name;
          // Проверяем, что название валидное
          if (title && title.trim() && title !== 'Рецепт из чата' && title.length >= 3 && title.length <= 60) {
            const ingredients = Array.isArray(recipe.ingredients)
              ? recipe.ingredients
              : recipe.ingredients?.split(',').map((i: string) => i.trim()) || [];
            const steps = Array.isArray(recipe.steps)
              ? recipe.steps
              : recipe.steps?.split('\n').filter((s: string) => s.trim()) || [];

            // Сохраняем только если есть хотя бы ингредиенты или шаги
            if (ingredients.length > 0 || steps.length > 0) {
              recipes.push({
                title: title.trim(),
                description: recipe.description || recipe.desc,
                ingredients,
                steps,
                cookingTime: recipe.cookingTime || recipe.cooking_time || recipe.time,
                mealType: recipe.mealType || mealType,
              });
            }
          }
        });
      }
    } catch (e) {
      // JSON не найден или невалидный, пробуем текстовый парсинг
      console.warn('Failed to parse JSON recipe:', e);
    }
  }

  // Если JSON не найден, НЕ парсим текст автоматически
  // Текстовый парсинг слишком ненадежен и создает некорректные рецепты
  // Сохраняем рецепты только если AI вернул их в структурированном формате (JSON)
  if (recipes.length === 0) {
    console.log('parseRecipesFromChat - No JSON found, skipping text parsing to avoid invalid recipes');
    // Возвращаем пустой массив вместо попытки парсить текст
    return recipes;
  }

  // Старый код текстового парсинга - отключен для надежности
  if (false && recipes.length === 0) {
    // Ищем названия рецептов в тексте
    // Паттерны для поиска названий рецептов:
    // 1. Заголовки с цифрами: "1. Название рецепта"
    // 2. Заголовки с маркерами: "- Название рецепта", "• Название рецепта"
    // 3. Заголовки после слов: "Вариант 1:", "Рецепт:", "Блюдо:"
    // 4. Заголовки в кавычках: "Название рецепта"
    // 5. Заголовки с подчеркиванием или жирным: **Название**, __Название__

    const recipeTitlePatterns = [
      // Паттерн 1: Нумерованные списки "1. Название" или "1) Название"
      /(?:^|\n)\s*(\d+)[\.\)]\s*([А-ЯЁ][А-Яа-яё\s]{2,60}?)(?:\n|:|\.|$)/g,
      // Паттерн 2: Маркеры "- Название" или "• Название"
      /(?:^|\n)\s*[-•*]\s*([А-ЯЁ][А-Яа-яё\s]{2,60}?)(?:\n|:|\.|$)/g,
      // Паттерн 3: После слов "Вариант", "Рецепт", "Блюдо"
      /(?:вариант|рецепт|блюдо)\s*\d*\s*[:\-]\s*([А-ЯЁ][А-Яа-яё\s]{2,60}?)(?:\n|:|\.|$)/gi,
      // Паттерн 4: В кавычках
      /["«]([А-ЯЁ][А-Яа-яё\s]{2,60}?)["»]/g,
      // Паттерн 5: Жирный текст **Название** или __Название__
      /\*\*([А-ЯЁ][А-Яа-яё\s]{2,60}?)\*\*/g,
      /__([А-ЯЁ][А-Яа-яё\s]{2,60}?)__/g,
      // Паттерн 6: Заголовки с ### или ##
      /(?:^|\n)\s*#{1,3}\s*([А-ЯЁ][А-Яа-яё\s]{2,60}?)(?:\n|$)/g,
    ];

    const foundTitles = new Set<string>();

    console.log('parseRecipesFromChat - Starting text parsing with', recipeTitlePatterns.length, 'patterns');

    for (const pattern of recipeTitlePatterns) {
      const matches = [...aiResponse.matchAll(pattern)];
      console.log('parseRecipesFromChat - Pattern matches:', matches.length);

      matches.forEach((match, index) => {
        // Берем название из группы захвата (обычно вторая группа)
        const title = (match[2] || match[1] || '').trim();

        console.log(`parseRecipesFromChat - Match ${index}:`, { title, match: match[0] });

        // Проверяем, что это похоже на название рецепта
        if (title.length >= 3 && title.length <= 80) {
          const lowerTitle = title.toLowerCase();

          // Исключаем общие слова и фразы
          const excludeWords = [
            'ингредиент', 'ингредиенты', 'приготовление', 'шаг', 'шаги', 'способ',
            'рецепт', 'вариант', 'блюдо', 'для', 'способ приготовления',
            'мякоть', 'размять', 'вилкой', 'нарезать', 'варить', 'жарить',
            'яркое', 'нравится', 'детям', 'полезно', 'вкусно'
          ];

          // Исключаем если начинается с исключаемых слов
          const isExcluded = excludeWords.some(word =>
            lowerTitle.startsWith(word) ||
            lowerTitle.includes(` ${word} `) ||
            lowerTitle.endsWith(` ${word}`)
          );

          // Исключаем описания (содержат слова-описания)
          const descriptionWords = [
            'яркое', 'нравится', 'полезно', 'вкусно', 'легко', 'просто',
            'быстро', 'полезный', 'вкусный', 'питательный'
          ];
          const isDescription = descriptionWords.some(word => lowerTitle.includes(word));

          // Исключаем инструкции (содержат глаголы действия)
          const actionVerbs = [
            'размять', 'нарезать', 'варить', 'жарить', 'тушить', 'готовить',
            'добавить', 'смешать', 'залить', 'положить', 'взять', 'нагреть'
          ];
          const isInstruction = actionVerbs.some(verb => lowerTitle.includes(verb));

          // Исключаем слишком длинные фразы, которые похожи на описания
          const isTooLong = title.length > 50 && title.split(' ').length > 6;

          // Исключаем фразы с запятыми (обычно это описания)
          const hasCommas = title.includes(',');

          if (!isExcluded && !isDescription && !isInstruction && !isTooLong && !hasCommas && !foundTitles.has(title)) {
            foundTitles.add(title);

            // Определяем тип приема пищи для этого конкретного рецепта
            // Ищем контекст вокруг названия
            const titleIndex = aiResponse.indexOf(title);
            const contextStart = Math.max(0, titleIndex - 150);
            const contextEnd = Math.min(aiResponse.length, titleIndex + title.length + 150);
            const context = aiResponse.substring(contextStart, contextEnd);

            // Определяем тип приема пищи из контекста
            const contextMealType = detectMealType(context) || mealType;

            console.log('parseRecipesFromChat - Found recipe:', { title, contextMealType, context: context.substring(0, 50) });

            recipes.push({
              title: title,
              description: `Рецепт предложен AI ассистентом`,
              ingredients: [],
              steps: [],
              mealType: contextMealType,
            });
          } else {
            console.log('parseRecipesFromChat - Excluded title:', title, { isExcluded, alreadyFound: foundTitles.has(title) });
          }
        }
      });

      // Если нашли рецепты, продолжаем поиск для других паттернов (может быть несколько рецептов)
      // Не break, чтобы найти все возможные рецепты
    }

    console.log('parseRecipesFromChat - Found', recipes.length, 'recipes from text parsing');
  }

  // Отключаем fallback парсинг - он создает некорректные рецепты
  // Сохраняем только структурированные рецепты из JSON
  if (false && recipes.length === 0 && (
    aiResponse.includes('рецепт') ||
    aiResponse.includes('ингредиент') ||
    aiResponse.includes('приготовить') ||
    aiResponse.includes('блюдо') ||
    aiResponse.includes('вариант')
  )) {
    // Пытаемся извлечь название рецепта из ответа
    // Ищем первое значимое название после слов "рецепт", "блюдо", "вариант"
    const titlePatterns = [
      // Более строгий паттерн: после "рецепт:" или "блюдо:" должно быть короткое название
      /(?:рецепт|блюдо|вариант)[:\s]+([А-ЯЁ][А-Яа-яё]{2,20}?)(?:\s|:|\.|$|\n)/i,
      // Название в кавычках
      /["«]([А-ЯЁ][А-Яа-яё\s]{2,30}?)["»]/,
      // Название после заголовка
      /(?:^|\n)\s*([А-ЯЁ][А-Яа-яё]{2,25}?)(?:\s|:|\.|$|\n)/,
    ];

    let title = 'Рецепт из чата';
    const excludeWords = [
      'ингредиент', 'приготовление', 'шаг', 'способ', 'рецепт', 'вариант',
      'блюдо', 'мякоть', 'размять', 'яркое', 'нравится'
    ];

    for (const pattern of titlePatterns) {
      const match = aiResponse.match(pattern);
      if (match && match[1]) {
        const candidate = match[1].trim();
        const lowerCandidate = candidate.toLowerCase();

        // Проверяем, что это не исключаемое слово и не слишком длинное
        const isValid = candidate.length >= 3 &&
          candidate.length <= 40 &&
          !excludeWords.some(word => lowerCandidate.includes(word)) &&
          !lowerCandidate.includes(',') &&
          candidate.split(' ').length <= 5;

        if (isValid) {
          title = candidate;
          break;
        }
      }
    }

    // Извлекаем ингредиенты (строки со списками или маркерами)
    const ingredientLines = aiResponse.split('\n').filter(line => {
      const trimmed = line.trim();
      return trimmed.length > 0 && (
        trimmed.includes('-') ||
        trimmed.includes('•') ||
        trimmed.includes('*') ||
        trimmed.match(/^\d+[\.\)]/) ||
        (trimmed.length < 100 && !trimmed.includes(':'))
      );
    });

    // Извлекаем шаги приготовления
    const stepLines = aiResponse.split('\n').filter(line => {
      const trimmed = line.trim();
      return trimmed.length > 15 && (
        trimmed.includes('приготов') ||
        trimmed.includes('добав') ||
        trimmed.includes('вари') ||
        trimmed.includes('жари') ||
        trimmed.includes('туши') ||
        trimmed.match(/^\d+[\.\)]/)
      );
    });

    recipes.push({
      title: title.length > 100 ? 'Рецепт из чата' : title,
      description: aiResponse.substring(0, 300),
      ingredients: ingredientLines.slice(0, 10).map(line => line.replace(/^[-•*\d\.\)]\s*/, '').trim()),
      steps: stepLines.length > 0
        ? stepLines.slice(0, 10).map(line => line.replace(/^\d+[\.\)]\s*/, '').trim())
        : aiResponse.split('\n').filter(line => line.trim().length > 20).slice(0, 5),
      mealType,
    });
  }

  console.log('parseRecipesFromChat - found recipes:', recipes.map(r => ({ title: r.title, mealType: r.mealType })));

  return recipes;

  return recipes;
}
