import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, it, vi } from "vitest";
import { createMockApi } from "../api";
import { RunMonitorView } from "./RunMonitorView";

it("lists recent runs with a message preview and opens a run", async () => {
  const user = userEvent.setup();
  const onOpenRun = vi.fn();
  render(<RunMonitorView client={createMockApi()} onOpenRun={onOpenRun} />);

  expect(await screen.findByText("My damaged 4K order 2048 needs a refund.")).toBeInTheDocument();
  await user.click(screen.getAllByRole("button", { name: "Open run" })[0]);

  expect(onOpenRun).toHaveBeenCalledWith("run_refund_2048");
});
