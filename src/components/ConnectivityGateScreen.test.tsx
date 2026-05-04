import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { ConnectivityGateScreen } from "./ConnectivityGateScreen";
import { connectivityUserMessages } from "@/utils/checkAppConnectivity";

describe("ConnectivityGateScreen", () => {
  it("renders blocked message and retry button", () => {
    render(
      <ConnectivityGateScreen
        result={{ reason: "blocked", message: connectivityUserMessages.blocked }}
      />,
    );
    expect(screen.getByRole("alert")).toBeInTheDocument();
    expect(screen.getByText(/VPN/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Попробовать снова/i })).toBeInTheDocument();
  });

  it("renders nothing for ok", () => {
    const { container } = render(<ConnectivityGateScreen result={{ reason: "ok" }} />);
    expect(container.firstChild).toBeNull();
  });
});
