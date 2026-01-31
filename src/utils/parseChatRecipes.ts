/**
 * Утилиты для парсинга рецептов из ответов AI в чате
 */

export interface ParsedRecipe {
  id?: string;
  title: string;
  description?: string;
  ingredients: string[];
  steps: string[];
  cookingTime?: number;
  mealType?: 'breakfast' | 'lunch' | 'snack' | 'dinner';
}

function generateTempRecipeId(): string {
  return typeof crypto !== 'undefined' && crypto.randomUUID
    ? crypto.randomUUID()
    : `temp-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
}

// Глаголы действия — такие строки считаем шагами приготовления, не ингредиентами
const ACTION_VERBS = [
  'нарезать', 'варить', 'обжарить', 'тушить', 'добавить', 'смешать', 'залить', 'положить',
  'взять', 'нагреть', 'готовить', 'размять', 'запечь', 'выложить', 'посолить', 'поперчить',
  'помешать', 'довести', 'остудить', 'подавать', 'украсить', 'промыть', 'очистить', 'натереть',
  'измельчить', 'отварить', 'пассеровать', 'запекать', 'выпекать', 'обжаривать', 'тушить',
  'довести до кипения', 'снять с огня', 'оставить на', 'перемешать', 'взбить', 'нарезать',
  'посыпать', 'полить', 'смазать', 'выложить', 'подать',
];

// Фразы-маркеры инструкции (не продукт для покупки)
const INSTRUCTION_PHRASES = ['перед подачей', 'по вкусу', 'по желанию', 'для подачи', 'при подаче'];

export function isInstruction(content: string): boolean {
  const t = content.trim();
  if (t.length <= 50) return false;
  // Запятая в середине — признак инструкции (перечисление действий)
  if (/,.{2,},/.test(t) || (t.includes(',') && t.length > 50)) return true;
  return false;
}

export function containsActionVerb(content: string): boolean {
  const lower = content.toLowerCase();
  return ACTION_VERBS.some((v) => lower.includes(v));
}

export function looksLikeInstructionPhrase(content: string): boolean {
  const lower = content.toLowerCase();
  return INSTRUCTION_PHRASES.some((p) => lower.includes(p));
}

/**
 * Парсит один рецепт из обычного текста (без JSON).
 * Ингредиенты — ТОЛЬКО из раздела "Ингредиенты"/"Список продуктов" или короткие строки с цифрой/буллетом без глаголов действия.
 * Длинные строки с запятыми и глаголы действия — в шаги, не в список покупок.
 */
export function parseRecipeFromPlainText(text: string): ParsedRecipe | null {
  const lines = text.split(/\n/).map((l) => l.trim()).filter(Boolean);
  if (lines.length === 0) return null;

  let title = '';
  const ingredients: string[] = [];
  const steps: string[] = [];
  let foundTitle = false;
  let inIngredientsSection = false;
  let inStepsSection = false;

  const excludeTitleWords = ['ингредиент', 'приготовление', 'шаг', 'способ', 'рецепт', 'блюдо', 'вариант', 'для'];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const lower = line.toLowerCase();

    // Название: первая строка с эмодзи, капсом или короткая без цифры в начале
    if (!foundTitle && line.length >= 2 && line.length <= 80) {
      const hasEmoji = /[\u{1F300}-\u{1F9FF}\u{2600}-\u{26FF}]/u.test(line);
      const startsWithCaps = /^[А-ЯЁA-Z]/.test(line);
      const notNumbered = !/^\d+[\.\)]\s*/.test(line);
      const notExcluded = !excludeTitleWords.some((w) => lower.startsWith(w) || lower === w);
      if ((hasEmoji || (startsWithCaps && notNumbered)) && notExcluded && !line.includes(':')) {
        title = line.replace(/^[\s\u{1F300}-\u{1F9FF}\u{2600}-\u{26FF}]*/u, '').trim() || line;
        foundTitle = true;
        continue;
      }
    }

    // Раздел "Ингредиенты" / "Список продуктов" — дальше идут только ингредиенты до "Приготовление"
    if (/^(ингредиенты|ингредиент|список продуктов)[:\s]*$/i.test(lower)) {
      inIngredientsSection = true;
      inStepsSection = false;
      continue;
    }
    if (/^(приготовление|шаги|способ приготовления)[:\s]*$/i.test(lower)) {
      inStepsSection = true;
      inIngredientsSection = false;
      continue;
    }

    // Строки вида "1. ..." или "- ..." / "• ..."
    const numberedMatch = line.match(/^\d+[\.\)]\s*(.+)$/);
    const bulletMatch = line.match(/^[-•*]\s*(.+)$/);
    const content = (numberedMatch?.[1] ?? bulletMatch?.[1] ?? '').trim();
    if (content.length === 0) continue;

    const isInstructionLine = isInstruction(content);
    const hasAction = containsActionVerb(content);
    const isInstructionPhrase = looksLikeInstructionPhrase(content);

    if (numberedMatch || bulletMatch) {
      // Инструкции (глаголы: варить, жарить и т.д.) — только в шаги, не в список продуктов
      if (inStepsSection || isInstructionLine || hasAction || isInstructionPhrase || content.length > 60) {
        steps.push(content);
      } else if (inIngredientsSection || (!inStepsSection && content.length <= 50 && !hasAction && !isInstructionPhrase)) {
        // Ограничение длины названия ингредиента (макс 50 символов)
        const trimmed = content.trim().slice(0, 50);
        if (trimmed) ingredients.push(trimmed);
      }
      continue;
    }
  }

  if (!title && lines[0]) {
    const first = lines[0];
    if (first.length >= 2 && first.length <= 80 && !/^\d+[\.\)]/.test(first)) {
      title = first.replace(/^[\s\u{1F300}-\u{1F9FF}\u{2600}-\u{26FF}]*/u, '').trim() || first;
    }
  }
  if (!title) title = 'Рецепт из чата';
  if (title.length < 2) return null;

  return {
    title: title.slice(0, 200),
    ingredients,
    steps,
    mealType: detectMealType(text),
  };
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
  let jsonString: string | null = null;

  // Сначала пробуем найти JSON в code blocks — берём всё содержимое между ```, чтобы не обрывать вложенные {}
  const codeBlockMatch = aiResponse.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (codeBlockMatch && codeBlockMatch[1]) {
    const blockContent = codeBlockMatch[1].trim();
    if (blockContent.startsWith('{') || blockContent.startsWith('[')) {
      jsonString = blockContent;
      console.log('parseRecipesFromChat - Found JSON in code block');
    }
  }
  if (!jsonString) {
    // Если не нашли в code block, ищем обычный JSON объект (жадный — от первой { до последней })
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
        if (title && title.trim() && title !== 'Рецепт из чата' && title.length >= 3 && title.length <= 80) {
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
          if (title && title.trim() && title !== 'Рецепт из чата' && title.length >= 3 && title.length <= 80) {
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

  // Если JSON не найден — парсим обычный текст: название (эмодзи/капс) и ингредиенты (1., 2., 3. или -)
  if (recipes.length === 0) {
    const textRecipe = parseRecipeFromPlainText(aiResponse);
    if (textRecipe) {
      textRecipe.id = textRecipe.id ?? generateTempRecipeId();
      recipes.push(textRecipe);
      console.log('parseRecipesFromChat - Parsed recipe from plain text:', textRecipe.title, 'id:', textRecipe.id);
    } else {
      console.log('parseRecipesFromChat - No JSON and no plain text recipe found');
    }
  }

  // Добавляем id тем рецептам, у которых его нет (для согласованности)
  recipes.forEach((r) => {
    if (!r.id) r.id = generateTempRecipeId();
  });

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
}
