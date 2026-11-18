// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useState, type JSX } from "react";
import { describe, expect, it } from "vitest";

import "../test-support/dom.js";
import { DropField } from "./DropField.js";
import { Icon } from "./Icon.js";
import { Ring, ScoreRing } from "./ScoreRing.js";

function Field(): JSX.Element {
  const [value, setValue] = useState("");
  return <DropField id="cv" label="Resume" placeholder="Paste" value={value} onChange={setValue} />;
}

const box = (): HTMLTextAreaElement => screen.getByLabelText<HTMLTextAreaElement>("Resume");

describe("DropField", () => {
  it("takes typed, dropped and uploaded text", async () => {
    const { container } = render(<Field />);
    expect(screen.getByText("Paste text or drop a .txt / .md file")).toBeDefined();
    fireEvent.change(box(), { target: { value: "Typed" } });
    expect(screen.getByText("5 characters")).toBeDefined();

    const zone = container.querySelector(".drop-box");
    if (zone === null) {
      throw new Error("no drop zone");
    }
    fireEvent.dragOver(zone);
    expect(zone.className).toBe("drop-box dragging");
    fireEvent.dragLeave(zone);
    expect(zone.className).toBe("drop-box");
    fireEvent.dragOver(zone);
    fireEvent.drop(zone, { dataTransfer: { files: [new File(["Dropped"], "cv.md")] } });
    expect(zone.className).toBe("drop-box");
    await waitFor(() => {
      expect(box().value).toBe("Dropped");
    });

    fireEvent.change(screen.getByLabelText("Resume file"), { target: { files: [new File(["Uploaded"], "cv.txt")] } });
    await waitFor(() => {
      expect(box().value).toBe("Uploaded");
    });
    fireEvent.drop(zone, { dataTransfer: { files: [] } });
    fireEvent.change(screen.getByLabelText("Resume file"), { target: { files: [] } });
    expect(box().value).toBe("Uploaded");
  });
});

describe("rings and icons", () => {
  it("draws progress rings, clamped to the circle", () => {
    const { container } = render(
      <>
        <Ring progress={2} size={20} stroke={2} />
        <Ring progress={-1} size={20} stroke={2} className="x" />
      </>,
    );
    const values = [...container.querySelectorAll<SVGCircleElement>(".ring-value")].map((circle) => circle.style.strokeDashoffset);
    expect(values[0]).toBe("0");
    expect(Number(values[1])).toBeGreaterThan(0);
  });

  it("tints small score rings and labels large ones", () => {
    const { container } = render(
      <>
        <ScoreRing score={4.2} />
        <ScoreRing score={3} />
        <ScoreRing score={1.5} />
        <ScoreRing score={4} size={160} label="out of 5" />
        <Icon name="check" />
      </>,
    );
    expect(container.querySelectorAll(".tone-high, .tone-mid, .tone-low")).toHaveLength(3);
    expect(screen.getByText("out of 5")).toBeDefined();
    expect(container.querySelector("svg[width='18']")).not.toBeNull();
  });
});
