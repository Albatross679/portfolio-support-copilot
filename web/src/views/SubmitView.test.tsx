import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, it, vi } from "vitest";
import { createMockApi } from "../api";
import { SubmitView } from "./SubmitView";

it("submits a message through the mock API and opens its run", async () => {
  const user = userEvent.setup();
  const onRunCreated = vi.fn();
  render(<SubmitView client={createMockApi()} onClearThread={vi.fn()} onRunCreated={onRunCreated} />);

  await user.type(screen.getByLabelText("Customer message"), "Where is my order #1082?");
  await user.click(screen.getByRole("button", { name: "Start support run" }));

  expect(onRunCreated).toHaveBeenCalledWith("run_demo_3000");
});

it("shows the daily budget message for a follow-up submission", async () => {
  const user = userEvent.setup();
  const client = { ...createMockApi(), createRun: async () => { throw new Error("Daily demo budget is used up, come back tomorrow."); } };
  render(<SubmitView client={client} threadId="thread_existing" onClearThread={vi.fn()} onRunCreated={vi.fn()} />);

  await user.type(screen.getByLabelText("Customer message"), "Can you clarify that?");
  await user.click(screen.getByRole("button", { name: "Start support run" }));

  expect(await screen.findByRole("alert")).toHaveTextContent("Daily demo budget is used up, come back tomorrow.");
});

it("shows an ownerless thread error for a follow-up submission", async () => {
  const user = userEvent.setup();
  const client = { ...createMockApi(), createRun: async () => { throw new Error("This support thread has no recorded owner. Start a new conversation."); } };
  render(<SubmitView client={client} threadId="thread_without_owner" onClearThread={vi.fn()} onRunCreated={vi.fn()} />);

  await user.type(screen.getByLabelText("Customer message"), "Can you clarify that?");
  await user.click(screen.getByRole("button", { name: "Start support run" }));

  expect(await screen.findByRole("alert")).toHaveTextContent("This support thread has no recorded owner. Start a new conversation.");
});

it("reuses the selected thread for a follow-up", async () => {
  const user = userEvent.setup();
  const client = createMockApi();
  render(<SubmitView client={client} threadId="thread_existing" onClearThread={vi.fn()} onRunCreated={vi.fn()} />);

  await user.type(screen.getByLabelText("Customer message"), "What did I just ask about?");
  await user.click(screen.getByRole("button", { name: "Start support run" }));

  expect((await client.getRun("run_demo_3000")).thread_id).toBe("thread_existing");
});

it("requires a customer message", async () => {
  const user = userEvent.setup();
  render(<SubmitView client={createMockApi()} onClearThread={vi.fn()} onRunCreated={vi.fn()} />);

  await user.click(screen.getByRole("button", { name: "Start support run" }));

  expect(screen.getByRole("alert")).toHaveTextContent("Enter a customer support message.");
});
