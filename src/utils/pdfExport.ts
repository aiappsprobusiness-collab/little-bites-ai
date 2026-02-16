import jsPDF from 'jspdf';

interface GeneratedMeal {
  name: string;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
}

interface GeneratedDay {
  breakfast: GeneratedMeal;
  lunch: GeneratedMeal;
  snack: GeneratedMeal;
  dinner: GeneratedMeal;
}

interface GeneratedPlan {
  days: Record<string, GeneratedDay>;
  /** Опциональный список продуктов (раздел в PDF не выводится). */
  product_list?: string[];
  total_calories_week: number;
}

const mealTypeLabels: Record<keyof GeneratedDay, string> = {
  breakfast: 'Завтрак',
  lunch: 'Обед',
  snack: 'Полдник',
  dinner: 'Ужин',
};

const mealTypeEmojis: Record<keyof GeneratedDay, string> = {
  breakfast: '🌅',
  lunch: '☀️',
  snack: '🍎',
  dinner: '🌙',
};

export function exportMealPlanToPDF(
  plan: GeneratedPlan,
  childName: string,
  goals: string[]
): void {
  const pdf = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
  });

  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();
  const margin = 15;
  const contentWidth = pageWidth - margin * 2;
  let yPos = margin;

  // Helper function to check if we need a new page
  const checkNewPage = (neededSpace: number) => {
    if (yPos + neededSpace > pageHeight - margin) {
      pdf.addPage();
      yPos = margin;
      return true;
    }
    return false;
  };

  // Helper to add text with proper encoding
  const addText = (text: string, x: number, y: number, options?: { fontSize?: number; fontStyle?: 'normal' | 'bold'; color?: [number, number, number] }) => {
    const { fontSize = 12, fontStyle = 'normal', color = [0, 0, 0] } = options || {};
    pdf.setFontSize(fontSize);
    pdf.setFont('helvetica', fontStyle);
    pdf.setTextColor(...color);
    pdf.text(text, x, y);
  };

  // Title
  addText('PLAN PITANIYA NA NEDELYU', pageWidth / 2, yPos, { fontSize: 20, fontStyle: 'bold' });
  pdf.setFontSize(20);
  const titleWidth = pdf.getTextWidth('PLAN PITANIYA NA NEDELYU');
  pdf.text('ПЛАН ПИТАНИЯ НА НЕДЕЛЮ', pageWidth / 2 - titleWidth / 2, yPos);
  yPos += 10;

  // Child info
  addText(`Rebenok: ${childName}`, margin, yPos, { fontSize: 12 });
  yPos += 6;

  if (goals.length > 0) {
    addText(`Celi: ${goals.join(', ')}`, margin, yPos, { fontSize: 10, color: [100, 100, 100] });
    yPos += 6;
  }

  addText(`Vsego: ~${Math.round(plan.total_calories_week / 7)} kkal/den`, margin, yPos, { fontSize: 10, color: [100, 100, 100] });
  yPos += 10;

  // Divider
  pdf.setDrawColor(200, 200, 200);
  pdf.line(margin, yPos, pageWidth - margin, yPos);
  yPos += 8;

  // Days
  const daysOrder = ['Понедельник', 'Вторник', 'Среда', 'Четверг', 'Пятница', 'Суббота', 'Воскресенье'];
  const daysTranslit: Record<string, string> = {
    'Понедельник': 'PONEDELNIK / Понедельник',
    'Вторник': 'VTORNIK / Вторник',
    'Среда': 'SREDA / Среда',
    'Четверг': 'CHETVERG / Четверг',
    'Пятница': 'PYATNICA / Пятница',
    'Суббота': 'SUBBOTA / Суббота',
    'Воскресенье': 'VOSKRESENE / Воскресенье',
  };

  for (const dayName of daysOrder) {
    const dayPlan = plan.days[dayName];
    if (!dayPlan) continue;

    checkNewPage(45);

    // Day header with background
    pdf.setFillColor(240, 253, 244); // Light green
    pdf.rect(margin, yPos - 4, contentWidth, 8, 'F');
    addText(daysTranslit[dayName] || dayName, margin + 2, yPos, { fontSize: 11, fontStyle: 'bold', color: [34, 139, 34] });
    yPos += 8;

    // Meals
    const mealTypes: (keyof GeneratedDay)[] = ['breakfast', 'lunch', 'snack', 'dinner'];

    for (const mealType of mealTypes) {
      const meal = dayPlan[mealType];
      if (!meal) continue;

      checkNewPage(12);

      // Meal type and name
      const mealLabel = mealTypeLabels[mealType];
      addText(`${mealLabel}:`, margin + 2, yPos, { fontSize: 10, fontStyle: 'bold' });
      addText(meal.name, margin + 22, yPos, { fontSize: 10 });

      // Macros
      const macroText = `${meal.calories} kkal | B:${meal.protein}g | U:${meal.carbs}g | ZH:${meal.fat}g`;
      addText(macroText, pageWidth - margin - 2, yPos, { fontSize: 8, color: [120, 120, 120] });
      pdf.text(macroText, pageWidth - margin - pdf.getTextWidth(macroText), yPos);

      yPos += 6;
    }

    yPos += 4;

    // Divider between days
    pdf.setDrawColor(230, 230, 230);
    pdf.line(margin, yPos, pageWidth - margin, yPos);
    yPos += 6;
  }

  // Footer
  let finalY = yPos + 10;
  if (finalY < pageHeight - margin - 10) {
    pdf.setDrawColor(200, 200, 200);
    pdf.line(margin, finalY, pageWidth - margin, finalY);
    addText('Sozdano v Mom Recipes', pageWidth / 2, finalY + 6, { fontSize: 8, color: [150, 150, 150] });
  }

  // Generate date-based filename
  const date = new Date().toISOString().split('T')[0];
  const filename = `meal-plan-${childName.toLowerCase().replace(/\s+/g, '-')}-${date}.pdf`;

  // Save the PDF
  pdf.save(filename);
}
