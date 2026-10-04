"use client";

import Link from "next/link";
import { useState } from "react";
import { formatDate } from "@/lib/constants";
import type { Locale, Messages } from "@/lib/i18n";

export type CalendarEvent = { id: string; name: string; time: string | null; venue: string };

export function CalendarMonth({
  month,
  days,
  leadingBlanks,
  todayDay,
  addDate,
  weekdays,
  events,
  admin,
  locale,
  labels,
}: {
  month: string;
  days: number;
  leadingBlanks: number;
  todayDay: number | null;
  addDate: string | null;
  weekdays: string[];
  events: Record<number, CalendarEvent[]>;
  admin: boolean;
  locale: Locale;
  labels: Messages["calendar"];
}) {
  const [selectedDay, setSelectedDay] = useState(() =>
    addDate?.startsWith(`${month}-`) ? Number(addDate.slice(8, 10)) : todayDay ?? Number(Object.keys(events)[0] ?? 1),
  );
  const iso = (day: number) => `${month}-${String(day).padStart(2, "0")}`;
  const selectedEvents = events[selectedDay] ?? [];
  const trailingBlanks = (7 - ((leadingBlanks + days) % 7)) % 7;

  return (
    <div className="overflow-hidden rounded-3xl bg-surface shadow-[0_8px_30px_rgba(0,0,0,0.04)]">
      <div className="grid grid-cols-7 gap-px bg-line p-px text-sm">
        {weekdays.map((day) => (
          <div key={day} className="bg-canvas py-3 text-center text-[10px] font-semibold text-muted uppercase sm:px-2 sm:text-xs">
            {day}
          </div>
        ))}
        {Array.from({ length: leadingBlanks }, (_, index) => (
          <div key={`before-${index}`} className="min-h-16 bg-canvas/60 sm:min-h-32" aria-hidden="true" />
        ))}
        {Array.from({ length: days }, (_, index) => {
          const day = index + 1;
          const items = events[day] ?? [];
          const selected = day === selectedDay;
          const isToday = day === todayDay;
          return (
            <div key={day} className={`min-w-0 bg-surface sm:min-h-32 sm:p-2 ${iso(day) === addDate ? "sm:bg-accent-soft" : ""}`}>
              <button
                type="button"
                aria-pressed={selected}
                aria-current={isToday ? "date" : undefined}
                aria-controls="calendar-day-agenda"
                aria-label={`${formatDate(iso(day), locale)} · ${items.length} ${labels.bookings}${items.length > 1 ? ` · ${labels.doubleBooked}` : ""}`}
                onClick={() => setSelectedDay(day)}
                className={`calendar-day flex min-h-16 w-full flex-col items-center justify-center gap-1.5 rounded-none p-1 sm:hidden ${selected ? "bg-ink text-white" : "bg-surface text-ink"}`}
              >
                <span className={`flex h-7 w-7 items-center justify-center rounded-full text-sm font-semibold ${isToday && !selected ? "bg-accent" : ""}`}>
                  {day}
                </span>
                <span className={`h-1.5 rounded-full ${items.length > 1 ? "w-5 bg-red-500" : items.length ? "w-1.5 bg-accent" : "w-1.5 bg-transparent"}`} aria-hidden="true" />
              </button>
              <div className="hidden sm:block">
                <div className="flex items-center justify-between gap-1">
                  <span aria-current={isToday ? "date" : undefined} className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs ${isToday ? "bg-ink font-semibold text-white" : "text-muted"}`}>
                    {day}
                  </span>
                  {admin ? (
                    <Link href={`/calendar?month=${month}&add=${iso(day)}#quick-booking`} prefetch={false} aria-label={`${labels.addDay} ${formatDate(iso(day), locale)}`} className="flex h-9 w-9 items-center justify-center rounded-full text-lg text-muted no-underline hover:bg-canvas hover:text-ink">
                      +
                    </Link>
                  ) : null}
                </div>
                {items.length > 1 ? <p className="mt-1 text-[10px] leading-tight font-medium text-red-700">{labels.doubleBooked}</p> : null}
                {items.map((item) => (
                  <Link key={item.id} href={`/weddings/${item.id}`} prefetch={false} title={[item.time, item.name, item.venue].filter(Boolean).join(" · ")} className="mt-1 block truncate rounded-lg bg-accent-soft px-2 py-2 text-xs text-ink no-underline hover:bg-accent">
                    {item.time ? <span className="font-semibold">{item.time} </span> : null}
                    {item.name}
                  </Link>
                ))}
              </div>
            </div>
          );
        })}
        {Array.from({ length: trailingBlanks }, (_, index) => (
          <div key={`after-${index}`} className="min-h-16 bg-canvas/60 sm:min-h-32" aria-hidden="true" />
        ))}
      </div>
      <section id="calendar-day-agenda" aria-labelledby="calendar-day-title" className="border-t border-line p-4 sm:hidden">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <h2 id="calendar-day-title" className="text-sm font-semibold" aria-live="polite">{formatDate(iso(selectedDay), locale)}</h2>
          {admin ? (
            <Link href={`/calendar?month=${month}&add=${iso(selectedDay)}#quick-booking`} prefetch={false} className="button min-h-11 no-underline">
              + {labels.addDay}
            </Link>
          ) : null}
        </div>
        {selectedEvents.length > 1 ? <p className="mb-3 rounded-xl bg-red-50 px-3 py-2 text-sm font-medium text-red-700">{labels.doubleBooked}</p> : null}
        {selectedEvents.length ? (
          <ul className="space-y-2">
            {selectedEvents.map((item) => (
              <li key={item.id}>
                <Link href={`/weddings/${item.id}`} prefetch={false} className="flex min-h-16 items-center gap-3 rounded-2xl bg-accent-soft px-3 py-3 text-ink no-underline active:bg-accent">
                  <span className="min-w-12 shrink-0 text-sm font-semibold">{item.time ?? "—"}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm leading-snug font-medium break-words">{item.name}</span>
                    {item.venue ? <span className="mt-1 block text-xs break-words text-muted">{item.venue}</span> : null}
                  </span>
                  <span aria-hidden="true">→</span>
                </Link>
              </li>
            ))}
          </ul>
        ) : <p className="rounded-2xl bg-canvas px-4 py-5 text-sm text-muted">{labels.emptyDay}</p>}
        <p className="mt-4 text-xs text-muted">{labels.selectDay}</p>
      </section>
    </div>
  );
}
