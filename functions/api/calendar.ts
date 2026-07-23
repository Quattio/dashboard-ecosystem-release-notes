// Release-timeline calendar endpoint (Cloudflare Pages Function).
//
// Fetches a Google Calendar "secret iCal address" server-side and returns the
// events as JSON, so the release pages can render a live release timeline
// without exposing the feed URL or hitting CORS in the browser.
//
// Auth: this route sits behind functions/_middleware.ts, so only a valid
// quatt.io session cookie reaches it — the calendar data is never public.
//
// Config: set the secret iCal URL as a Cloudflare Pages secret named
// RELEASE_TIMELINE_ICS_URL (Google Calendar → Settings → <calendar> →
// "Secret address in iCal format"). Until it is set, the endpoint returns 501
// and the page simply hides its timeline section (no breakage).

interface Env {
  RELEASE_TIMELINE_ICS_URL?: string;
}

interface CalEvent {
  title: string;
  start: string; // ISO date (YYYY-MM-DD) or ISO datetime
  end: string | null;
  allDay: boolean;
  description: string;
  location: string;
}

// Unfold RFC 5545 folded lines (a CRLF followed by a space/tab continues the
// previous line), then split into logical lines.
function unfold(ics: string): string[] {
  return ics.replace(/\r\n/g, "\n").replace(/\n[ \t]/g, "").split("\n");
}

// Unescape TEXT values per RFC 5545 (\\n, \\,, \\;, \\\\).
function unescapeText(v: string): string {
  return v
    .replace(/\\n/gi, "\n")
    .replace(/\\,/g, ",")
    .replace(/\\;/g, ";")
    .replace(/\\\\/g, "\\");
}

// Convert an iCal date/date-time value to ISO. Returns { iso, allDay }.
function parseDate(value: string): { iso: string; allDay: boolean } | null {
  const v = value.trim();
  // DATE: YYYYMMDD
  const dateOnly = /^(\d{4})(\d{2})(\d{2})$/.exec(v);
  if (dateOnly) {
    return { iso: `${dateOnly[1]}-${dateOnly[2]}-${dateOnly[3]}`, allDay: true };
  }
  // DATE-TIME: YYYYMMDDTHHMMSS(Z)?  — treat trailing Z as UTC, else floating.
  const dt = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})(Z)?$/.exec(v);
  if (dt) {
    const iso = `${dt[1]}-${dt[2]}-${dt[3]}T${dt[4]}:${dt[5]}:${dt[6]}${dt[7] ? "Z" : ""}`;
    return { iso, allDay: false };
  }
  return null;
}

function parseIcs(ics: string): CalEvent[] {
  const lines = unfold(ics);
  const events: CalEvent[] = [];
  let cur: (Partial<CalEvent> & { _recurring?: boolean }) | null = null;

  for (const line of lines) {
    if (line === "BEGIN:VEVENT") {
      cur = { title: "", end: null, allDay: false, description: "", location: "" };
      continue;
    }
    if (line === "END:VEVENT") {
      // Skip un-expanded recurring masters (they carry an RRULE and a DTSTART
      // back at the series start). The concrete instances that matter here are
      // one-off events and per-occurrence overrides (RECURRENCE-ID, no RRULE) —
      // e.g. the version-tagged milestones — which keep their real dates.
      if (cur && cur.start && !cur._recurring) events.push(cur as CalEvent);
      cur = null;
      continue;
    }
    if (!cur) continue;
    if (/^RRULE[:;]/i.test(line)) { cur._recurring = true; continue; }

    const colon = line.indexOf(":");
    if (colon === -1) continue;
    const rawName = line.slice(0, colon);
    const value = line.slice(colon + 1);
    const name = rawName.split(";")[0].toUpperCase();

    switch (name) {
      case "SUMMARY":
        cur.title = unescapeText(value);
        break;
      case "DESCRIPTION":
        cur.description = unescapeText(value);
        break;
      case "LOCATION":
        cur.location = unescapeText(value);
        break;
      case "DTSTART": {
        const p = parseDate(value);
        if (p) { cur.start = p.iso; cur.allDay = p.allDay; }
        break;
      }
      case "DTEND": {
        const p = parseDate(value);
        if (p) cur.end = p.iso;
        break;
      }
      default:
        break;
    }
  }

  // Sort chronologically by start.
  events.sort((a, b) => (a.start < b.start ? -1 : a.start > b.start ? 1 : 0));
  return events;
}

export const onRequestGet = async (context: { env: Env }) => {
  const { env } = context;
  const icsUrl = env.RELEASE_TIMELINE_ICS_URL;

  if (!icsUrl) {
    return new Response(
      JSON.stringify({
        ok: false,
        error: "not_configured",
        message:
          "RELEASE_TIMELINE_ICS_URL is not set. Add the Google Calendar secret iCal address as a Cloudflare Pages secret to enable the release timeline.",
      }),
      { status: 501, headers: { "Content-Type": "application/json" } },
    );
  }

  try {
    const res = await fetch(icsUrl, {
      headers: { Accept: "text/calendar" },
      // Cache at the edge for 15 min so we don't hammer Google on every view.
      cf: { cacheTtl: 900, cacheEverything: true },
    } as RequestInit);

    if (!res.ok) {
      return new Response(
        JSON.stringify({ ok: false, error: "upstream", status: res.status }),
        { status: 502, headers: { "Content-Type": "application/json" } },
      );
    }

    const ics = await res.text();
    const events = parseIcs(ics);

    return new Response(
      JSON.stringify({ ok: true, count: events.length, events }),
      {
        status: 200,
        headers: {
          "Content-Type": "application/json",
          // Behind auth → private; refresh every 15 min in the browser.
          "Cache-Control": "private, max-age=900",
        },
      },
    );
  } catch (error) {
    return new Response(
      JSON.stringify({
        ok: false,
        error: "fetch_failed",
        message: error instanceof Error ? error.message : String(error),
      }),
      { status: 502, headers: { "Content-Type": "application/json" } },
    );
  }
};
