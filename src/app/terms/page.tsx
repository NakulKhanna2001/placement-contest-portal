import { PageHeader } from "../components/page-header";
import { SupportContact } from "../components/support-contact";

export const metadata = { title: "Participation rules" };

export default function ParticipationRules() {
  return <main className="narrow">
    <PageHeader title="Participation rules" description="The rules for joining and taking part in NST LC Grind contests." />
    <article className="card policy-content">
      <h2>Joining a contest</h2>
      <p>Anyone with a verified Google account can sign in as a student. Only explicitly appointed accounts receive administrator access. Link your own LeetCode account before the contest starts; that username is locked after verification.</p>

      <h2>Solving and scoring</h2>
      <p>Solve the published problems on LeetCode and submit your accepted submission links here. A solve must be accepted inside its batch’s one-hour window. LeetCode’s acceptance time determines the score and early bonus; the portal’s displayed contest settings define the bonus and link deadline.</p>
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
