import { PageHeader } from "../components/page-header";
import { SupportContact } from "../components/support-contact";

export const metadata = { title: "Participation rules" };

export default function ParticipationRules() {
  return <main className="narrow">
    <PageHeader title="Participation rules" description="The rules for joining and taking part in NST LC Grind contests." />
    <article className="card policy-content">
      <h2>Joining a contest</h2>
      <p>Anyone with a verified Google account can sign in as a student. Verify your own LeetCode profile on the Account page before opening contest problems or standings. You can complete verification and join during a live contest; the same problem windows and submission deadline apply. Your LeetCode username is locked after verification. Only explicitly appointed accounts receive administrator access.</p>
      <p>Administrators may preview all contest problems and standings without LeetCode verification. To submit scored solves, administrators must still verify their own LeetCode account and follow the same batch eligibility and scoring rules.</p>

      <h2>Solving and scoring</h2>
      <p>All displayed contest times and scheduling inputs use India Standard Time (IST).</p>
      <p>Solve the published problems on LeetCode and submit your accepted submission links here. Each batch opens at its scheduled start, or early for you after all four solves in the preceding batch are verified. Early acceptances must be at or after the last required acceptance in that preceding batch. All unlocked problems remain scoreable until one minute after the scheduled contest end, inclusive: 3 hours 1 minute for a three-hour contest.</p>
      <p>LeetCode’s acceptance time determines the score. Eligible early-access solves earn the bonus, which ends at the batch’s original scheduled start plus its configured bonus window (normally 15 minutes). Early access does not shift that cutoff or the contest’s link deadline.</p>
      <p>After a batch’s bonus cutoff, eligible acceptances earn base points until the common solve deadline. Links may be pasted during the configured link grace period, which is at least long enough to include the final scoring minute.</p>
      <p>Each problem counts once per participant, using the earliest known valid acceptance. Rankings use points, then Hard problems solved, then the earliest last counted solve.</p>

      <h2>Submitting links</h2>
      <p>Submit promptly after solving. LeetCode only exposes the most recent 20 accepted entries, and the portal archives them when you submit a link rather than on a schedule. If an older record is no longer public and was never saved, automatic verification may fail. You may contact an administrator with evidence.</p>

      <h2>Fair participation and review</h2>
      <p>Use your own linked account and do not submit another person’s work or misrepresent account ownership. After a contest, participants may report concerns with evidence. Administrators can dismiss reports, revoke solves, disqualify participants, grant verified exceptions, and correct scores. These actions are audited and may change final standings.</p>

      <h2>Questions</h2>
      <SupportContact />
    </article>
  </main>;
}
