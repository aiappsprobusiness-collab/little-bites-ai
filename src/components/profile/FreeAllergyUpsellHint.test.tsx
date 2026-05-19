import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { FreeAllergyUpsellHint } from "./FreeAllergyUpsellHint";
import {
  FREE_ALLERGY_LIMIT_REACHED_HINT,
  FREE_ALLERGY_UPSELL_LINK_LABEL,
} from "@/utils/friendlyLimitCopy";

describe("FreeAllergyUpsellHint", () => {
  it("renders hint and calls onLearnMore when link clicked", () => {
    const onLearnMore = vi.fn();

    render(<FreeAllergyUpsellHint onLearnMore={onLearnMore} />);

    expect(screen.getByText(FREE_ALLERGY_LIMIT_REACHED_HINT, { exact: false })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: FREE_ALLERGY_UPSELL_LINK_LABEL }));
    expect(onLearnMore).toHaveBeenCalledTimes(1);
  });
});
