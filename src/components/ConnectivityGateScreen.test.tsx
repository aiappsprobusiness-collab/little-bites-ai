import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { ConnectivityGateScreen } from "./ConnectivityGateScreen";

describe("ConnectivityGateScreen", () => {
  it("renders blocked message and reload button", () => {
    render(
      <ConnectivityGateScreen
        result={{ reason: "blocked", message: "Сайт не открывается. Попробуйте включить VPN." }}
      />,
    );
    expect(screen.getByRole("alert")).toBeInTheDocument();
    expect(screen.getByText(/VPN/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Обновить страницу/i })).toBeInTheDocument();
  });

  it("renders nothing for ok", () => {
    const { container } = render(<ConnectivityGateScreen result={{ reason: "ok" }} />);
    expect(container.firstChild).toBeNull();
  });
});
