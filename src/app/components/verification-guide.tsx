const screenshots = [
  { file: "edit-profile", width: 1280, height: 904, title: "Open your LeetCode profile", text: <>Sign in to the LeetCode account you’ll solve with, then choose <strong>Edit Profile</strong>. You can also open <a href="https://leetcode.com/settings/profile/" target="_blank" rel="noreferrer">profile settings directly</a>.</>, alt: "LeetCode profile with the Edit Profile button highlighted" },
  { file: "profile-readme", width: 1280, height: 771, title: "Find ReadMe", text: <>Under <strong>General</strong>, scroll down and select <strong>ReadMe</strong>.</>, alt: "LeetCode profile settings with the ReadMe row highlighted under General" },
  { file: "save-readme", width: 1028, height: 546, title: "Paste your code and save", text: <>Add your complete verification code to ReadMe, keeping any existing text you want, and click <strong>Save</strong>.</>, alt: "Update ReadMe dialog showing where to paste the code and the Save button" },
];

export function VerificationGuide() {
  return <div className="verification-guide">
    <ol className="verification-steps">
      <li><h3>Get your verification code</h3><p>On this portal’s Account page, click <strong>Get verification code</strong> and copy your personal <code>contest-…</code> code.</p></li>
      {screenshots.map(step => <li key={step.file}>
        <h3>{step.title}</h3><p>{step.text}</p>
        <a className="guide-image-link" href={`/verification/${step.file}.webp`} target="_blank" rel="noreferrer" aria-label={`Enlarge screenshot: ${step.title} (opens in a new tab)`}>
          {/* Already-sized, optimized local WebPs; no image transformation needed. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={`/verification/${step.file}.webp`} width={step.width} height={step.height} alt={step.alt} loading="lazy" decoding="async" />
        </a>
      </li>)}
      <li><h3>Return here and verify</h3><p>Enter your <strong>LeetCode username</strong> on the Account page, then click <strong>Verify account</strong>. Use your username, not your email or display name.</p><p>You can remove the code from ReadMe after verification succeeds. Your linked username cannot be changed.</p></li>
    </ol>
    <p className="card-footnote">Screenshots are examples — use your own account and code. Tap a screenshot to enlarge it.</p>
  </div>;
}
