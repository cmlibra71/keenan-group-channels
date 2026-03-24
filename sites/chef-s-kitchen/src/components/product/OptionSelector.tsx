"use client";

type OptionValue = {
  id: number;
  optionId: number;
  label: string;
  valueData: unknown;
  sortOrder: number | null;
};

type Option = {
  id: number;
  displayName: string;
  type: string;
};

export function OptionSelector({
  option,
  values,
  selectedValueId,
  disabledValueIds,
  onSelect,
}: {
  option: Option;
  values: OptionValue[];
  selectedValueId: number | null;
  disabledValueIds: Set<number>;
  onSelect: (optionId: number, valueId: number) => void;
}) {
  const type = option.type || "rectangles";

  if (type === "dropdown") {
    return (
      <div>
        <label className="block text-sm font-semibold text-text-primary mb-2">
          {option.displayName}
        </label>
        <select
          value={selectedValueId ?? ""}
          onChange={(e) => {
            const val = parseInt(e.target.value, 10);
            if (!isNaN(val)) onSelect(option.id, val);
          }}
          className="w-full input"
        >
          <option value="">Select {option.displayName}</option>
          {values.map((v) => (
            <option key={v.id} value={v.id} disabled={disabledValueIds.has(v.id)}>
              {v.label}
            </option>
          ))}
        </select>
      </div>
    );
  }

  if (type === "swatch") {
    return (
      <div>
        <label className="block text-sm font-semibold text-text-primary mb-2">
          {option.displayName}
          {selectedValueId && (
            <span className="ml-2 font-normal text-text-secondary">
              {values.find((v) => v.id === selectedValueId)?.label}
            </span>
          )}
        </label>
        <div className="flex flex-wrap gap-2">
          {values.map((v) => {
            const data = v.valueData as { colors?: string[]; imageUrl?: string } | null;
            const color = data?.colors?.[0];
            const imageUrl = data?.imageUrl;
            const isSelected = v.id === selectedValueId;
            const isDisabled = disabledValueIds.has(v.id);

            return (
              <button
                key={v.id}
                onClick={() => onSelect(option.id, v.id)}
                disabled={isDisabled}
                title={v.label}
                className={`h-9 w-9 rounded-full border-2 transition-all ${
                  isSelected
                    ? "border-text-primary ring-2 ring-text-primary ring-offset-1"
                    : "border-border hover:border-text-secondary"
                } ${isDisabled ? "opacity-30 cursor-not-allowed" : "cursor-pointer"}`}
                style={
                  imageUrl
                    ? { backgroundImage: `url(${imageUrl})`, backgroundSize: "cover" }
                    : color
                      ? { backgroundColor: color }
                      : undefined
                }
              />
            );
          })}
        </div>
      </div>
    );
  }

  if (type === "radio_buttons") {
    return (
      <div>
        <label className="block text-sm font-semibold text-text-primary mb-2">
          {option.displayName}
        </label>
        <div className="space-y-2">
          {values.map((v) => {
            const isDisabled = disabledValueIds.has(v.id);
            return (
              <label
                key={v.id}
                className={`flex items-center gap-2 text-sm ${isDisabled ? "opacity-40 cursor-not-allowed" : "cursor-pointer"}`}
              >
                <input
                  type="radio"
                  name={`option-${option.id}`}
                  checked={v.id === selectedValueId}
                  onChange={() => onSelect(option.id, v.id)}
                  disabled={isDisabled}
                  className="accent-text-primary"
                />
                {v.label}
              </label>
            );
          })}
        </div>
      </div>
    );
  }

  // Default: rectangles (button pills)
  return (
    <div>
      <label className="block text-sm font-semibold text-text-primary mb-2">
        {option.displayName}
      </label>
      <div className="flex flex-wrap gap-2">
        {values.map((v) => {
          const isSelected = v.id === selectedValueId;
          const isDisabled = disabledValueIds.has(v.id);
          return (
            <button
              key={v.id}
              onClick={() => onSelect(option.id, v.id)}
              disabled={isDisabled}
              className={`px-4 py-2 border text-sm transition-colors duration-300 ${
                isSelected
                  ? "border-text-primary bg-surface-dark text-white"
                  : isDisabled
                    ? "border-border text-text-muted cursor-not-allowed"
                    : "border-border hover:border-text-primary/30"
              }`}
            >
              {v.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
