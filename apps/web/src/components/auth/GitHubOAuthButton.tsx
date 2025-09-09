import { Button } from "@/components/ui/button";
import { authClient } from "@/lib/auth-client";
import { SiGithub } from "@icons-pack/react-simple-icons";

export function GitHubOAuthButton() {
  return (
    <Button
      className="w-full"
      onClick={() => authClient.signIn.social({ provider: "github" })}
      type="button"
      variant="outline"
    >
      <SiGithub className="mr-2 size-4" />
      Continue with GitHub
    </Button>
  );
}
