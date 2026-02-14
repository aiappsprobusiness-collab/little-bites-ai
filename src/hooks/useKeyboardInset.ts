import { useState, useEffect } from "react";

/**
 * Вычисляет высоту области, занятой клавиатурой (visualViewport меньше layout viewport).
 * Используется для padding-bottom или translate контейнера с инпутом, чтобы инпут
 * оставался видимым над клавиатурой на мобильных (Android Chrome и др.).
 * На десктопе возвращает 0.
 */
export function useKeyboardInset(enabled: boolean = true): number {
  const [inset, setInset] = useState(0);

  useEffect(() => {
    if (!enabled || typeof window === "undefined" || !window.visualViewport) {
      setInset(0);
      return;
    }

    const update = () => {
      const vv = window.visualViewport;
      const heightDiff = window.innerHeight - vv.height;
      // Считаем клавиатуру открытой, если видимая высота заметно меньше (обычно > 150px на мобильных)
      const keyboardOffset = heightDiff > 80 ? Math.round(heightDiff) : 0;
      setInset(keyboardOffset);
    };

    update();
    window.visualViewport.addEventListener("resize", update);
    window.visualViewport.addEventListener("scroll", update);
    return () => {
      window.visualViewport.removeEventListener("resize", update);
      window.visualViewport.removeEventListener("scroll", update);
    };
  }, [enabled]);

  return inset;
}
