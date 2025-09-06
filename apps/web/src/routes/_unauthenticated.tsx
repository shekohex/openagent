import { createFileRoute, Outlet } from "@tanstack/react-router";
import { Unauthenticated } from "convex/react";

export const Route = createFileRoute("/_unauthenticated")({
  component: UnauthenticatedLayout,
});

function UnauthenticatedLayout() {
  return (
    <Unauthenticated>
      <Outlet />
    </Unauthenticated>
  );
}
