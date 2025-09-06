import { convexQuery } from "@convex-dev/react-query";
import { api } from "@openagent/backend/convex/_generated/api";
import { useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/_authenticated/")({
  component: HomeComponent,
});

const TITLE_TEXT = `
 ██████╗ ███████╗████████╗████████╗███████╗██████╗
 ██╔══██╗██╔════╝╚══██╔══╝╚══██╔══╝██╔════╝██╔══██╗
 ██████╔╝█████╗     ██║      ██║   █████╗  ██████╔╝
 ██╔══██╗██╔══╝     ██║      ██║   ██╔══╝  ██╔══██╗
 ██████╔╝███████╗   ██║      ██║   ███████╗██║  ██║
 ╚═════╝ ╚══════╝   ╚═╝      ╚═╝   ╚══════╝╚═╝  ╚═╝

 ████████╗    ███████╗████████╗ █████╗  ██████╗██╗  ██╗
 ╚══██╔══╝    ██╔════╝╚══██╔══╝██╔══██╗██╔════╝██║ ██╔╝
    ██║       ███████╗   ██║   ███████║██║     █████╔╝
    ██║       ╚════██║   ██║   ██╔══██║██║     ██╔═██╗
    ██║       ███████║   ██║   ██║  ██║╚██████╗██║  ██╗
    ╚═╝       ╚══════╝   ╚═╝   ╚═╝  ╚═╝ ╚═════╝╚═╝  ╚═╝ `;

function HomeComponent() {
  const healthCheck = useSuspenseQuery(convexQuery(api.healthCheck.get, {}));

  const getStatusColor = () => {
    if (healthCheck.data === "OK") {
      return "bg-green-500";
    }
    if (healthCheck.isLoading) {
      return "bg-orange-400";
    }
    return "bg-red-500";
  };

  const getStatusText = () => {
    if (healthCheck.isLoading) {
      return "Checking...";
    }
    if (healthCheck.data === "OK") {
      return "Connected";
    }
    return "Error";
  };

  return (
    <div className="container mx-auto max-w-3xl px-4 py-2">
      <pre className="overflow-x-auto font-mono text-sm">{TITLE_TEXT}</pre>
      <div className="grid gap-6">
        <section className="rounded-lg border p-4">
          <h2 className="mb-2 font-medium">API Status</h2>
          <div className="flex items-center gap-2">
            <div className={`h-2 w-2 rounded-full ${getStatusColor()}`} />
            <span className="text-muted-foreground text-sm">
              {getStatusText()}
            </span>
          </div>
        </section>
      </div>
    </div>
  );
}
