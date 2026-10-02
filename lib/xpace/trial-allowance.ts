/** Bookings still pending reserve an allowance; missed or cancelled lessons release it. */
export function countsTowardTrialAllowance(appointment: { booking_kind: string; attendance_status: string }): boolean {
  return appointment.booking_kind === "NOVO" && !["FALTOU", "CANCELADO"].includes(appointment.attendance_status);
}
