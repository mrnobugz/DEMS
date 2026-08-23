import { useRef, useState } from "react";
import { Printer } from "lucide-react";
import {
  patientCardDocument,
  printIframeWindow,
  printPatientCard,
  printQueueTicket,
  printRegistrationPack,
  queueTicketDocument,
  registrationPackDocument,
  type PrintableRegistration,
} from "@/lib/printRegistration";

export function RegistrationPrintPanel({ data }: { data: PrintableRegistration }) {
  const ticketRef = useRef<HTMLIFrameElement>(null);
  const cardRef = useRef<HTMLIFrameElement>(null);
  const packRef = useRef<HTMLIFrameElement>(null);
  const [error, setError] = useState("");

  function run(label: string, action: () => void) {
    setError("");
    try {
      action();
    } catch (err) {
      setError(err instanceof Error ? err.message : `Could not print the ${label}.`);
    }
  }

  return (
    <div className="reg-print">
      <div className="reg-print__head">
        <p className="reg-section__title">Print</p>
        <p className="text-[11px] text-muted">
          Ticket and card are ready below. Print opens the browser dialog — no pop-up window.
        </p>
      </div>
      <iframe
        ref={packRef}
        title="Ticket and card"
        className="reg-print__pack"
        srcDoc={registrationPackDocument(data)}
        tabIndex={-1}
      />
      <div className="reg-print__previews">
        <figure className="reg-print__item">
          <iframe
            ref={ticketRef}
            title="Queue ticket"
            className="reg-print__frame"
            srcDoc={queueTicketDocument(data)}
          />
          <figcaption>Queue ticket</figcaption>
        </figure>
        <figure className="reg-print__item">
          <iframe
            ref={cardRef}
            title="Patient identity card"
            className="reg-print__frame is-card"
            srcDoc={patientCardDocument(data)}
          />
          <figcaption>Patient card</figcaption>
        </figure>
      </div>
      <div className="reg-print__actions">
        <button
          type="button"
          className="btn-primary inline-flex items-center gap-2"
          onClick={() =>
            run("ticket and card", () => {
              try {
                printIframeWindow(packRef.current);
              } catch {
                printRegistrationPack(data);
              }
            })
          }
        >
          <Printer size={16} /> Print ticket + card
        </button>
        <button
          type="button"
          className="btn-ghost"
          onClick={() =>
            run("ticket", () => {
              try {
                printIframeWindow(ticketRef.current);
              } catch {
                printQueueTicket(data);
              }
            })
          }
        >
          Queue ticket
        </button>
        <button
          type="button"
          className="btn-ghost"
          onClick={() =>
            run("card", () => {
              try {
                printIframeWindow(cardRef.current);
              } catch {
                printPatientCard(data);
              }
            })
          }
        >
          Patient card
        </button>
      </div>
      {error && <p className="px-4 pb-3 text-xs text-red-600">{error}</p>}
    </div>
  );
}
