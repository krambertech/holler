import { Checkbox } from "@/components/ui/checkbox";
import { DateTimeInput } from "@/components/ui/date-time-input";
import { Field, FieldLabel } from "@/components/ui/field";
import { fromPicker, toPicker } from "./picker-time";
import { type Reach, type SendFields, type ZoneCount, zoneName } from "./send-logic";
import { SendSettingsLanding } from "./send-settings-landing";
import { rowLinkClassName } from "./send-settings-rows";

interface Props {
  value: SendFields;
  onChange: (patch: Partial<SendFields>) => void;
  context: { now: Date; senderZone: string; zones: ZoneCount[] };
  reach: Reach;
  invalid: boolean;
  onSendNow: () => void;
}

function SendSettingsSend({ value, onChange, context, reach, invalid, onSendNow }: Props) {
  const { now, senderZone, zones } = context;
  if (!value.sendAt) return null;
  return (
    <>
      <div className="flex flex-wrap items-end gap-3">
        <DateTimeInput
          className="sm:w-auto sm:min-w-80"
          value={toPicker(value.sendAt, senderZone)}
          min={toPicker(now, senderZone)}
          onValueChange={(picked) => onChange({ sendAt: fromPicker(picked, senderZone) })}
          aria-invalid={invalid || undefined}
        />
      </div>
      <Field orientation="horizontal">
        <Checkbox
          checked={value.sendInRecipientTimeZone}
          onCheckedChange={(next) => onChange({ sendInRecipientTimeZone: next })}
        />
        <FieldLabel>
          In each person's own time zone
          <span className="text-muted">, instead of yours ({zoneName(senderZone)})</span>
        </FieldLabel>
      </Field>
      <SendSettingsLanding
        sendAt={value.sendAt}
        inRecipientTimeZone={value.sendInRecipientTimeZone}
        senderZone={senderZone}
        zones={zones}
        reach={reach}
        now={now}
      />
      <button type="button" onClick={onSendNow} className={rowLinkClassName}>
        Send now instead
      </button>
    </>
  );
}

export { SendSettingsSend };
