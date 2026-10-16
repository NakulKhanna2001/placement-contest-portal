import { PageHeader } from "../components/page-header";
import { SupportContact } from "../components/support-contact";

export const metadata = { title: "Privacy policy" };

export default function Privacy() {
  return <main className="narrow">
    <PageHeader title="Privacy policy" description="How NST LC Grind uses information to run coding contests." />
    <article className="card policy-content">
      <h2>Information used by the portal</h2>
      <p>Google sign-in provides your name, verified email address, and profile-image URL. The portal stores your name, email, account role, and creation time. We request basic profile and email access, not access to Gmail or Google Drive.</p>
      <p>When you link LeetCode, we store your username and verification status. A temporary bio code proves account ownership. Submitted links, public accepted-submission IDs, problem names/slugs, acceptance times, scores, verification attempts, and contest activity are stored to verify and rank solves.</p>
      <p>If you file a report, we store its description and evidence URL. Administrative decisions and changes are recorded in an audit log.</p>

      <h2>Why this information is used</h2>
      <p>We use these records to sign you in, link the correct LeetCode account, verify submissions, calculate rankings, review reports, and resolve scoring issues. The portal does not request your LeetCode password or store your submitted source code.</p>

      <h2>What other participants can see</h2>
      <p>Published contest schedules are public. Signed-in users can see participant names, points, rankings, solve times, and manual/revoked/disqualified status in contest views. Report descriptions and evidence links are available to administrators for review.</p>

      <h2>Service providers and cookies</h2>
      <p>Google handles authentication, Vercel hosts the application, Neon stores its database, and LeetCode supplies public profile and accepted-submission information. These providers process information needed to deliver their services. The application uses an authentication cookie to maintain your session; hosting providers may also process technical request logs.</p>

      <h2>Stored records and requests</h2>
      <p>Contest, account, verification, and audit records remain stored for operating the portal. There is currently no automatic retention/deletion schedule. Signing out ends access to your session but does not delete stored records. Contact the administrator about correcting or deleting your information.</p>
      <SupportContact />
    </article>
  </main>;
}
