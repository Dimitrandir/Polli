import type { Booking } from "./api";
import { icsStamp } from "./format";

const SALON = "SIS Esthetics Hair";

function escape(text: string) {
  return text.replace(/\\/g, "\\\\").replace(/;/g, "\;").replace(/,/g, "\\,").replace(/\n/g, "\\n");
}

/** A calendar file the client can add to their phone calendar. */
export function bookingToIcs(booking: Booking, manageUrl: string): string {
  const services = booking.items.map((i) => `${i.service_name} (${i.specialist_name})`).join(", ");
  return [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//SIS Esthetics//Booking//BG",
    "BEGIN:VEVENT",
    `UID:booking-${booking.id}@sisesthetics.com`,
    `DTSTAMP:${icsStamp(booking.created_at)}`,
    `DTSTART:${icsStamp(booking.start)}`,
    `DTEND:${icsStamp(booking.end)}`,
    `SUMMARY:${escape(`${SALON}: ${booking.items.map((i) => i.service_name).join(", ")}`)}`,
    `DESCRIPTION:${escape(`${services}\nУправление на резервацията: ${manageUrl}`)}`,
    `LOCATION:${escape(SALON)}`,
    "END:VEVENT",
    "END:VCALENDAR",
  ].join("\r\n");
}
