import { Button } from "@/components/ui/button";
import { useAuthActions } from "@convex-dev/auth/react";
import { SiGithub } from "@icons-pack/react-simple-icons";

export function GitHubOAuthButton() {
  const { signIn } = useAuthActions();

  return (
    <Button
      className="w-full"
      onClick={() => signIn("github", { redirectTo: "/" })}
      type="button"
      variant="outline"
    >
      <SiGithub className="mr-2 size-4" />
      Continue with GitHub
    </Button>
  );
}
