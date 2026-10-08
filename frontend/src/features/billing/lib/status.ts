export type StatusTone = "draft" | "issued" | "partial" | "paid" | "void" | "refunded" | "overdue";

export function getStatusMeta(status: string, overdue = false): { label: string; tone: StatusTone } {
  if (overdue && (status === "issued" || status === "partially_paid" || status === "draft")) {
    return { label: "Overdue", tone: "overdue" };
  }
  switch (status) {
    case "draft":
      return { label: "Draft", tone: "draft" };
    case "issued":
      return { label: "Issued", tone: "issued" };
    case "partially_paid":
      return { label: "Partial", tone: "partial" };
    case "paid":
      return { label: "Paid", tone: "paid" };
    case "void":
      return { label: "Void", tone: "void" };
    case "refunded":
      return { label: "Refunded", tone: "refunded" };
    default:
      return { label: status.replaceAll("_", " "), tone: "draft" };
  }
}
