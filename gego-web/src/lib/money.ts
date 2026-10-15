/** Tanzanian shillings. TSH is the same currency as ISO TZS. */
export function formatTsh(amount: number) {
  const formatted = new Intl.NumberFormat("en-TZ", { maximumFractionDigits: 0 }).format(amount);
  return `TSH ${formatted}`;
}

export function formatDate(iso: string, lang: "sw" | "en") {
  const date = new Date(`${iso}T00:00:00`);
  if (Number.isNaN(date.getTime())) return iso;
  return new Intl.DateTimeFormat(lang === "sw" ? "sw-TZ" : "en-TZ", {
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(date);
}
