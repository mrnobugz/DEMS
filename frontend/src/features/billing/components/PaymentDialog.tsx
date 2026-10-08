import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { PAYMENT_METHODS } from "@/features/billing/types";

const methods = ["cash", "card", "mobile_money", "bank_transfer", "insurance", "other"] as const;

const schema = z.object({
  amount: z.number().positive("Enter an amount greater than zero"),
  method: z.enum(methods),
  reference: z.string().optional(),
});

type PaymentValues = z.infer<typeof schema>;

function PaymentForm({
  balance,
  busy,
  onCancel,
  onSubmit,
}: {
  balance: number;
  busy: boolean;
  onCancel: () => void;
  onSubmit: (values: PaymentValues) => Promise<void>;
}) {
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors },
  } = useForm<PaymentValues>({
    resolver: zodResolver(schema),
    defaultValues: { amount: balance, method: "cash", reference: "" },
  });

  return (
    <form
      className="space-y-3"
      onSubmit={handleSubmit(async (values) => {
        if (values.amount > balance + 0.001) {
          setError("amount", { message: "Amount is more than the balance" });
          return;
        }
        await onSubmit({ ...values, reference: values.reference?.trim() || undefined });
      })}
    >
      <label className="block text-sm">
        <span className="label">Amount</span>
        <input className="input tabular-nums" type="number" min={0} step="1" max={balance} {...register("amount", { valueAsNumber: true })} />
        {errors.amount && <span className="mt-1 block text-sm text-danger">{errors.amount.message}</span>}
      </label>
      <label className="block text-sm">
        <span className="label">Method</span>
        <select className="input" {...register("method")}>
          {PAYMENT_METHODS.map((method) => (
            <option key={method.value} value={method.value}>
              {method.label}
            </option>
          ))}
        </select>
      </label>
      <label className="block text-sm">
        <span className="label">Reference</span>
        <input className="input" {...register("reference")} placeholder="Receipt or transaction id" />
      </label>
      <div className="flex justify-end gap-2">
        <Button variant="ghost" type="button" onClick={onCancel} disabled={busy}>
          Cancel
        </Button>
        <Button type="submit" disabled={busy || balance <= 0}>
          {busy ? "Saving…" : "Save payment"}
        </Button>
      </div>
    </form>
  );
}

export function PaymentDialog({
  open,
  balance,
  money,
  busy,
  onOpenChange,
  onSubmit,
}: {
  open: boolean;
  balance: number;
  money: (amount: number) => string;
  busy: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (values: PaymentValues) => Promise<void>;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent title="Record payment" description={`Balance due ${money(balance)}. The invoice updates after the payment is saved.`}>
        {open && <PaymentForm key={balance} balance={balance} busy={busy} onCancel={() => onOpenChange(false)} onSubmit={onSubmit} />}
      </DialogContent>
    </Dialog>
  );
}
