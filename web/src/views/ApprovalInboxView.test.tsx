import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, it, vi } from "vitest";
import { createMockApi } from "../api";
import { ApprovalInboxView } from "./ApprovalInboxView";

it("lists paused mock runs and approves one", async () => {
  const user = userEvent.setup();
  const client = createMockApi();
  const listRuns = vi.spyOn(client, "listRuns");
  render(<ApprovalInboxView client={client} onOpenRun={vi.fn()} />);

  expect(await screen.findByText("run_refund_2048")).toBeInTheDocument();
  expect(listRuns).toHaveBeenCalledWith("awaiting_approval", 100);
  await user.click(screen.getByRole("button", { name: "Approve refund" }));

  expect(await screen.findByText("No runs are awaiting approval.")).toBeInTheDocument();
});

it("rejects a paused mock run", async () => {
  const user = userEvent.setup();
  const client = createMockApi();
  render(<ApprovalInboxView client={client} onOpenRun={vi.fn()} />);

  await screen.findByText("run_refund_2048");
  await user.click(screen.getByRole("button", { name: "Reject refund" }));

  expect((await client.getRun("run_refund_2048")).answer).toMatch(/not approved/);
});
