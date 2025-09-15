import { SiGithub } from "@icons-pack/react-simple-icons";
import { Button } from "@/components/ui/button";
import { authClient } from "@/lib/auth-client";

const isGitHubAuthEnabled =
  import.meta.env.VITE_AUTH_GITHUB_ID &&
  import.meta.env.VITE_AUTH_GITHUB_SECRET;

export function GitHubOAuthButton() {
  if (!isGitHubAuthEnabled) {
    return null;
  }

  return (
    <Button
      className="w-full"
      onClick={() => authClient.signIn.social({ provider: "github" })}
      type="button"
      variant="outline"
    >
      <SiGithub aria-hidden="true" className="mr-2 size-4" />
      Continue with GitHub
    </Button>
  );
}
