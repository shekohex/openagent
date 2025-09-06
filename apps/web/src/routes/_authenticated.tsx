import { createFileRoute, Outlet } from "@tanstack/react-router";
import { Authenticated } from "convex/react";

export const Route = createFileRoute("/_authenticated")({
  beforeLoad: ({ context: _ }) => {
    // This will be handled by the Authenticated wrapper component
  },
  component: AuthenticatedLayout,
});

function AuthenticatedLayout() {
  return (
    <Authenticated>
      <Outlet />
    </Authenticated>
  );
}
