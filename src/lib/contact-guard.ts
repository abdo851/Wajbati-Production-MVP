/** Blocks off-platform contact: phones, emails, and links. Text only. */
export function messageSharesContact(body: string): boolean {
  if (/@/.test(body)) return true;
  if (/data:image|data:application/i.test(body)) return true;
  if (/(https?:\/\/|www\.)/i.test(body)) return true;
  if (/\b[\w-]+\.(?:com|ma|net|org|fr|io|me|co|info)\b/i.test(body)) return true;
  if (/\+212/.test(body)) return true;
  const compact = body.replace(/[\s.\-()/]/g, "");
  if (/(?:\+|00)?212[67]\d{8}/.test(compact)) return true;
  if (/0[67]\d{8}/.test(compact)) return true;
  if (/(?:\d[\s.\-]*){8,}/.test(body)) return true;
  return false;
}
