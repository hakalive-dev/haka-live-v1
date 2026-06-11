/** Age in full years from an ISO date-of-birth string (matches backend computeAge). */
export function computeAgeFromBirthday(dob: string | null | undefined): number | null {
  if (!dob?.trim()) return null;
  const birth = new Date(dob);
  if (Number.isNaN(birth.getTime())) return null;

  const now = new Date();
  let age = now.getFullYear() - birth.getFullYear();
  const monthDelta = now.getMonth() - birth.getMonth();
  if (monthDelta < 0 || (monthDelta === 0 && now.getDate() < birth.getDate())) {
    age -= 1;
  }
  return age >= 0 && age < 150 ? age : null;
}
