// Names the signed-in account on screen without spelling out its address: enough for the student
// to recognise their own (or notice it is not theirs), not enough to read over a shoulder.
export function maskEmail(email: string): string {
  const at = email.lastIndexOf("@");
  const first = Array.from(email)[0];
  if (at <= 0 || first === undefined) return "***";
  return `${first}***${email.slice(at)}`;
}
