import { Link } from "@tanstack/react-router";
import { Authenticated, Unauthenticated } from "convex/react";
import { Button } from "@/components/ui/button";
import { UserMenu } from "@/components/auth/UserMenu";

export default function Header() {
  const links = [{ to: "/", label: "Home" }] as const;

  return (
    <div>
      <div className="flex flex-row items-center justify-between px-2 py-1">
        <nav className="flex gap-4 text-lg">
          {links.map(({ to, label }) => {
            return (
              <Link key={to} to={to}>
                {label}
              </Link>
            );
          })}
        </nav>
        <div className="flex items-center gap-2">
          <Authenticated>
            <UserMenu />
          </Authenticated>
          <Unauthenticated>
            <Link to="/login">
              <Button variant="ghost" size="sm">
                Sign In
              </Button>
            </Link>
          </Unauthenticated>
        </div>
      </div>
      <hr />
    </div>
  );
}
