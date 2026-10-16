export function SupportContact() {
  const email = process.env.SUPPORT_EMAIL;
  return email
    ? <p>For account, contest, or data questions, contact <a href={`mailto:${email}`}>{email}</a>.</p>
    : <p>For account, contest, or data questions, contact your contest administrator.</p>;
}
