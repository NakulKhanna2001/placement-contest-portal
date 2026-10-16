import Link from "next/link";
import { VerificationGate } from "./verification-gate";

export function VerificationRequired() {
  return <VerificationGate action={<Link className="button" href="/account">Verify LeetCode profile</Link>} />;
}
