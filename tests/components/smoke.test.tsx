// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { afterEach, describe, expect, it } from "vitest";

function Counter() {
  const [count, setCount] = useState(0);
  return (
    <div>
      <output>{`count ${count}`}</output>
      <button type="button" onClick={() => setCount((value) => value + 1)}>
        Add
      </button>
    </div>
  );
}

afterEach(cleanup);

describe("component test toolchain", () => {
  it("transforms TSX, renders into jsdom and reacts to user-event clicks", async () => {
    const user = userEvent.setup();
    render(<Counter />);
    expect(screen.getByRole("status").textContent).toBe("count 0");
    await user.click(screen.getByRole("button", { name: "Add" }));
    expect(screen.getByRole("status").textContent).toBe("count 1");
    expect(screen.queryByRole("dialog")).toBeNull();
  });
});
