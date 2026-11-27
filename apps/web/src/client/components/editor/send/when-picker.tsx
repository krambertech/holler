import { type ComponentProps, useId } from "react";
import { DateTimeInput } from "@/components/ui/date-time-input";
import { Field, FieldLabel } from "@/components/ui/field";
import { Plate } from "@/components/ui/plate";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Select, SelectContent, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/cn";
import { useControllableState } from "@/lib/use-controllable-state";
import { fromPicker, toPicker, tomorrowMorning } from "./picker-time";
import { type Reach, type SendFields, sendSummary, type ZoneCount, zoneName } from "./send-logic";
import { useNow } from "./use-now";
import { WhenPickerLanding } from "./when-picker-landing";

type WhenFields = Pick<SendFields, "sendAt" | "sendInRecipientTimeZone">;

interface Props extends Omit<ComponentProps<"section">, "defaultValue" | "onChange"> {
  value?: WhenFields | undefined;
  defaultValue?: WhenFields | undefined;
  onValueChange?: ((value: WhenFields) => void) | undefined;
  problem?: string | undefined;
  reach: Reach;
  zones?: ZoneCount[] | undefined;
  now?: Date | undefined;
  timeZone?: string | undefined;
}

const sendNow: WhenFields = { sendAt: null, sendInRecipientTimeZone: false };

function WhenPicker({
  value: valueProp,
  defaultValue = sendNow,
  onValueChange,
  problem,
  reach,
  zones = [],
  now: fixedNow,
  timeZone,
  className,
  ...props
}: Props) {
  const [value, setValue] = useControllableState({
    value: valueProp,
    defaultValue,
    onChange: onValueChange,
  });
  const headingId = useId();
  const now = useNow(fixedNow);
  const senderZone = timeZone ?? Intl.DateTimeFormat().resolvedOptions().timeZone;
  const summary = sendSummary(value, { now, senderZone, zones }, problem);
  const later = value.sendAt !== null;

  return (
    <section
      data-slot="when-picker"
      aria-labelledby={headingId}
      className={cn("grid gap-2.5", className)}
      {...props}
    >
      <h2 id={headingId} className="px-1 text-lg">
        When it goes out
      </h2>
      <Plate className="px-5 py-4">
        <RadioGroup
          aria-labelledby={headingId}
          value={later ? "later" : "now"}
          onValueChange={(next) =>
            setValue(
              next === "later"
                ? { sendAt: tomorrowMorning(now, senderZone), sendInRecipientTimeZone: false }
                : sendNow,
            )
          }
          className="flex flex-wrap gap-x-8 gap-y-3"
        >
          <Field orientation="horizontal" className="w-auto">
            <RadioGroupItem value="now" />
            <FieldLabel>Now</FieldLabel>
          </Field>
          <Field orientation="horizontal" className="w-auto">
            <RadioGroupItem value="later" />
            <FieldLabel>Later</FieldLabel>
          </Field>
        </RadioGroup>
        {value.sendAt && (
          <div data-slot="when-picker-later" className="mt-4 grid gap-4">
            <div className="flex flex-wrap items-end gap-3">
              <DateTimeInput
                className="sm:w-auto sm:min-w-80"
                value={toPicker(value.sendAt, senderZone)}
                min={toPicker(now, senderZone)}
                onValueChange={(picked) =>
                  setValue({ ...value, sendAt: fromPicker(picked, senderZone) })
                }
                aria-invalid={summary.tone === "danger" || undefined}
              />
              <Field className="w-full sm:w-56">
                <FieldLabel>Whose clock</FieldLabel>
                <Select
                  value={value.sendInRecipientTimeZone ? "theirs" : "yours"}
                  onValueChange={(next) =>
                    setValue({ ...value, sendInRecipientTimeZone: next === "theirs" })
                  }
                  items={[
                    { value: "yours", label: `Yours, ${zoneName(senderZone)}` },
                    { value: "theirs", label: "Each person's own" },
                  ]}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent />
                </Select>
              </Field>
            </div>
            <WhenPickerLanding
              sendAt={value.sendAt}
              inRecipientTimeZone={value.sendInRecipientTimeZone}
              senderZone={senderZone}
              zones={zones}
              reach={reach}
              now={now}
            />
          </div>
        )}
      </Plate>
      {summary.tone === "danger" && (
        <p role="alert" className="px-1 text-danger-ink text-sm">
          {summary.description}
        </p>
      )}
    </section>
  );
}

export { WhenPicker };
