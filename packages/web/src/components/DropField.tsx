import { useState, type ChangeEvent, type DragEvent, type JSX } from "react";

import { Icon } from "./Icon.js";

interface DropFieldProps {
  readonly id: string;
  readonly label: string;
  readonly placeholder: string;
  readonly value: string;
  readonly onChange: (value: string) => void;
}

/** A text area that also takes a dropped or uploaded .txt / .md file. */
export function DropField({ id, label, placeholder, value, onChange }: DropFieldProps): JSX.Element {
  const [dragging, setDragging] = useState(false);
  const load = (file: File | undefined): void => {
    if (file !== undefined) {
      void file.text().then(onChange);
    }
  };
  const onDrop = (event: DragEvent<HTMLDivElement>): void => {
    event.preventDefault();
    setDragging(false);
    load(event.dataTransfer.files[0]);
  };
  const onDragOver = (event: DragEvent<HTMLDivElement>): void => {
    event.preventDefault();
    setDragging(true);
  };
  return (
    <div className="drop">
      <div className="drop-head">
        <label htmlFor={id}>{label}</label>
        <span className="faint">Optional</span>
      </div>
      <div
        className={dragging ? "drop-box dragging" : "drop-box"}
        onDragOver={onDragOver}
        onDragLeave={() => {
          setDragging(false);
        }}
        onDrop={onDrop}
      >
        <textarea
          id={id}
          value={value}
          placeholder={placeholder}
          onChange={(event) => {
            onChange(event.target.value);
          }}
        />
        <div className="drop-foot">
          <span>{value.length > 0 ? `${value.length.toLocaleString()} characters` : "Paste text or drop a .txt / .md file"}</span>
          <label className="pill upload">
            <Icon name="upload" size={14} /> Upload
            <input
              type="file"
              accept=".txt,.md,text/plain,text/markdown"
              aria-label={`${label} file`}
              onChange={(event: ChangeEvent<HTMLInputElement>) => {
                load(event.target.files?.[0]);
              }}
            />
          </label>
        </div>
      </div>
    </div>
  );
}
