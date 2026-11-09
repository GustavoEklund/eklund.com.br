/** Days as `YYYY-MM-DD`, in UTC, which is how the collector files rows and counts their age. */
export class Calendar {
  static day(date) {
    return date.toISOString().slice(0, 10);
  }

  static daysBefore(day, days) {
    const date = new Date(`${day}T00:00:00Z`);
    date.setUTCDate(date.getUTCDate() - days);
    return Calendar.day(date);
  }

  /** The same day of the month `months` earlier, or the last day of that month when it is shorter (31 March, 30 April). */
  static monthsBefore(day, months) {
    const [year, month, date] = day.split('-').map(Number);
    const first = new Date(Date.UTC(year, month - 1 - months, 1));
    const length = new Date(
      Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0),
    ).getUTCDate();
    first.setUTCDate(Math.min(date, length));
    return Calendar.day(first);
  }
}
