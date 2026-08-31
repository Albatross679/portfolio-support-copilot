import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { api } from "./api";
import App from "./App";

vi.mock("./api", async (importOriginal) => {
  const original = await importOriginal<typeof import("./api")>();
  return { ...original, api: original.createMockApi() };
});

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

  it("restores follow-up submission for completed employee runs", async () => {
    const user = userEvent.setup();
    window.history.replaceState({}, "", "/employees/runs/run_shipping_1082");
    render(<App />);

    await user.click(await screen.findByRole("button", { name: "Send a follow-up in this thread" }));

    expect(screen.getByText(/Continuing thread/)).toHaveTextContent("thread_shipping_1082");
  });

  it("keeps an anonymous run reachable after customer identification", async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.type(screen.getByLabelText("Message"), "What is your return policy?");
    await user.click(screen.getByRole("button", { name: "Start support request" }));
    const anonymousRunPath = window.location.pathname;
    expect(await screen.findByText(/return policy allows/)).toBeInTheDocument();

    await user.click(screen.getByRole("link", { name: "Support Copilot" }));
    await user.click(screen.getByText("Check your orders"));
    await user.type(screen.getByLabelText("Name"), "Maya Chen");
    await user.type(screen.getByLabelText("Email"), "maya@example.test");
    await user.click(screen.getByRole("button", { name: "Find my orders" }));
    expect(await screen.findByText("ORD-1001")).toBeInTheDocument();

    window.history.pushState({}, "", anonymousRunPath);
    window.dispatchEvent(new PopStateEvent("popstate"));

    expect(await screen.findByText(/return policy allows/)).toBeInTheDocument();
  });
});
