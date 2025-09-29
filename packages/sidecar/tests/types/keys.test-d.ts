import type { SidecarKeyPair } from "../../src/auth/keys";
import { generateSidecarKeyPair } from "../../src/auth/keys";

// Type test - this function is not called but validates types at compile time
async function _t() {
  const kp = await generateSidecarKeyPair();
  // type assertions
  const _: SidecarKeyPair = kp;
  const pub: string = kp.publicKey;
  const id: string = kp.keyId;
  // consume variables in a side-effect-free way to satisfy noUnusedLocals
  Number.isFinite(pub.length);
  Number.isFinite(id.length);
  return _;
}

// Export to avoid unused function warning
export { _t };
