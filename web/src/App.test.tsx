import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import App from "./App";

describe("App navigation", () => {
  beforeEach(() => {
    window.history.replaceState({}, "", "/");
  });

  it("keeps the employee approval inbox accessible", () => {
    window.history.replaceState({}, "", "/employees");
    render(<App />);

    expect(screen.getByRole("link", { name: "Approval inbox" })).toHaveAttribute(
      "href",
      "/employees/approvals",
    );
  });
});
