import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, it, vi } from "vitest";
import { createMockApi } from "../api";
import { DailyRunLimitView } from "./DailyRunLimitView";

it("loads and saves the daily run limit", async () => {
  const user = userEvent.setup();
  const client = createMockApi();
  const setDailyRunLimit = vi.spyOn(client, "setDailyRunLimit");
  render(<DailyRunLimitView client={client} />);

  expect(await screen.findByDisplayValue("50")).toBeInTheDocument();
  await user.clear(screen.getByLabelText("Daily run limit"));
  await user.type(screen.getByLabelText("Daily run limit"), "2");
  await user.click(screen.getByRole("button", { name: "Save limit" }));

  expect(setDailyRunLimit).toHaveBeenCalledWith(2);
  expect(await screen.findByRole("status")).toHaveTextContent("Daily run limit saved.");
});
