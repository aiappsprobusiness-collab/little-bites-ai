import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";

import { Toaster } from "@/components/ui/toaster";
import { useToast } from "@/hooks/use-toast";

vi.mock("@/hooks/use-toast", () => ({
  useToast: vi.fn(),
}));

describe("Toaster", () => {
  beforeEach(() => {
    vi.mocked(useToast).mockReset();
  });

  it("кладёт action под блок заголовка/описания (ряд с pl-8), а не справа от текста", () => {
    vi.mocked(useToast).mockReturnValue({
      toasts: [
        {
          id: "t1",
          title: "Подобрали 2 из 3 блюд.",
          description: "Подсказка для пользователя.",
          action: (
            <button type="button" className="rounded border px-2 py-1 text-xs">
              Избранное
            </button>
          ),
          open: true,
        },
      ],
      toast: vi.fn(),
      dismiss: vi.fn(),
    });

    const { container } = render(<Toaster />);

    expect(screen.getByText("Подобрали 2 из 3 блюд.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Избранное/i })).toBeInTheDocument();

    const actionRow = container.querySelector(".pl-8.flex.flex-wrap");
    expect(actionRow).not.toBeNull();
    expect(actionRow?.contains(screen.getByRole("button", { name: /Избранное/i }))).toBe(true);
  });

  it("без action не добавляет нижний ряд с pl-8", () => {
    vi.mocked(useToast).mockReturnValue({
      toasts: [
        {
          id: "t2",
          title: "Готово",
          description: undefined,
          open: true,
        },
      ],
      toast: vi.fn(),
      dismiss: vi.fn(),
    });

    const { container } = render(<Toaster />);
    expect(screen.getByText("Готово")).toBeInTheDocument();
    expect(container.querySelector(".pl-8.flex.flex-wrap")).toBeNull();
  });
});
