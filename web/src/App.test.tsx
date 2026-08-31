import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { api } from "./api";
import App from "./App";

describe("App navigation", () => {
  beforeEach(() => {
    window.history.replaceState({}, "", "/");
    window.localStorage.clear();
    vi.restoreAllMocks();
  });

  it("keeps the employee approval inbox accessible", () => {
    window.history.replaceState({}, "", "/employees");
    render(<App />);

    expect(screen.getByRole("link", { name: "Approval inbox" })).toHaveAttribute(
      "href",
      "/employees/approvals",
    );
  });

  it("opens a customer follow-up and shows the daily budget message", async () => {
    const user = userEvent.setup();
    window.localStorage.setItem("support-copilot.customer", JSON.stringify({ id: 7, name: "Avery Stone", email: "avery@example.com" }));
    window.history.replaceState({}, "", "/customer/runs/run-completed");
    vi.spyOn(api, "getCustomerRun").mockResolvedValue({ run_id: "run-completed", thread_id: "thread-existing", status: "completed" });
    const createRun = vi.spyOn(api, "createRun").mockRejectedValue(new Error("Daily demo budget is used up, come back tomorrow."));
    render(<App />);

    await user.click(await screen.findByRole("button", { name: "Send a follow-up in this thread" }));
    await user.type(screen.getByLabelText("Customer message"), "Can you clarify that?");
    await user.click(screen.getByRole("button", { name: "Start support run" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Daily demo budget is used up, come back tomorrow.");
    expect(createRun).toHaveBeenCalledWith(expect.objectContaining({
      customer: { id: 7, name: "Avery Stone", email: "avery@example.com" },
      thread_id: "thread-existing",
    }));
  });
});
