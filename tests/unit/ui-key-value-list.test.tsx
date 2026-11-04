import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { KeyValueList } from "@/components/ui/key-value-list";
import { PanelStrip } from "@/components/ui/panel";

afterEach(cleanup);

describe("KeyValueList", () => {
  it.each([true, false])("keeps only dt and dd inside each row group (leaders: %s)", (leaders) => {
    const { container } = render(
      <KeyValueList
        leaders={leaders}
        items={[
          { id: "net", label: "Network", value: "Hideki 50383", check: "pass" },
          { id: "id", label: "Order id", value: "184,467,203", hint: "From the receipt" },
        ]}
      />,
    );

    const groups = container.querySelectorAll("dl > div");
    expect(groups).toHaveLength(2);
    for (const group of groups) {
      expect(Array.from(group.children, (child) => child.tagName)).toEqual(["DT", "DD"]);
    }
    expect(screen.getByText("Network").closest("dt")).not.toBeNull();
    expect(screen.getByText("Hideki 50383").closest("dd")).not.toBeNull();
  });
});

describe("PanelStrip", () => {
  it("keeps the data age out of the uppercase treatment", () => {
    render(<PanelStrip status="live" items={["Hideki 50383", "Block 38,357,692"]} age="2s" />);

    expect(screen.getByText("2s")).toHaveClass("normal-case");
    expect(screen.getByText("Live")).toBeInTheDocument();
  });
});
