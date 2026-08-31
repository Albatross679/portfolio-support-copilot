import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, it, vi } from "vitest";
import { createMockApi } from "../api";
import type { CustomerIdentity } from "../types";
import { CustomerPortalView } from "./CustomerPortalView";

const maya: CustomerIdentity = { id: 1, name: "Maya Chen", email: "maya@example.test" };

it("identifies a customer from their name and email", async () => {
  const user = userEvent.setup();
  const onIdentified = vi.fn();
  render(<CustomerPortalView client={createMockApi()} onIdentified={onIdentified} onSignedOut={vi.fn()} onRunCreated={vi.fn()} />);

  await user.type(screen.getByLabelText("Name"), "Maya Chen");
  await user.type(screen.getByLabelText("Email"), "maya@example.test");
  await user.click(screen.getByRole("button", { name: "Find my orders" }));

  expect(onIdentified).toHaveBeenCalledWith(maya);
});

it("shows a lookup failure for a wrong name and email pair", async () => {
  const user = userEvent.setup();
  render(<CustomerPortalView client={createMockApi()} onIdentified={vi.fn()} onSignedOut={vi.fn()} onRunCreated={vi.fn()} />);

  await user.type(screen.getByLabelText("Name"), "Maya Chen");
  await user.type(screen.getByLabelText("Email"), "wrong@example.test");
  await user.click(screen.getByRole("button", { name: "Find my orders" }));

  expect(await screen.findByRole("alert")).toHaveTextContent("could not find a customer");
});

it("shows the daily budget message when a customer request is refused", async () => {
  const user = userEvent.setup();
  const client = { ...createMockApi(), createRun: async () => { throw new Error("Daily demo budget is used up, come back tomorrow."); } };
  render(<CustomerPortalView client={client} customer={maya} onIdentified={vi.fn()} onSignedOut={vi.fn()} onRunCreated={vi.fn()} />);

  await user.type(screen.getByLabelText("Message"), "Please help with my order.");
  await user.click(screen.getByRole("button", { name: "Start support request" }));

  expect(await screen.findByRole("alert")).toHaveTextContent("Daily demo budget is used up, come back tomorrow.");
});

it("lists orders and sends the selected order with a support message", async () => {
  const user = userEvent.setup();
  const client = createMockApi();
  const onRunCreated = vi.fn();
  render(<CustomerPortalView client={client} customer={maya} onIdentified={vi.fn()} onSignedOut={vi.fn()} onRunCreated={onRunCreated} />);

  expect(await screen.findByText("ORD-1001")).toBeInTheDocument();
  await user.selectOptions(screen.getByLabelText("What is this about?"), "ORD-1004");
  await user.type(screen.getByLabelText("Message"), "The case arrived damaged.");
  await user.click(screen.getByRole("button", { name: "Start support request" }));

  expect(onRunCreated).toHaveBeenCalledWith("run_demo_3000");
  expect((await client.getCustomerRun(maya, "run_demo_3000")).extraction?.order_number).toBe("ORD-1004");
});
