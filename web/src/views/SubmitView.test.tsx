import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, it, vi } from "vitest";
import { createMockApi } from "../api";
import { SubmitView } from "./SubmitView";

it("submits a message through the mock API and opens its run", async () => {
  const user = userEvent.setup();
  const onRunCreated = vi.fn();
  render(<SubmitView client={createMockApi()} onRunCreated={onRunCreated} />);

  await user.type(screen.getByLabelText("Customer message"), "Where is my order #1082?");
  await user.click(screen.getByRole("button", { name: "Start support run" }));

  expect(onRunCreated).toHaveBeenCalledWith("run_demo_3000");
});

it("requires a customer message", async () => {
  const user = userEvent.setup();
  render(<SubmitView client={createMockApi()} onRunCreated={vi.fn()} />);

  await user.click(screen.getByRole("button", { name: "Start support run" }));

  expect(screen.getByRole("alert")).toHaveTextContent("Enter a customer support message.");
});
