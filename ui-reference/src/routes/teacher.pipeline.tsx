import { createFileRoute } from "@tanstack/react-router";
import { ConnectedWorkspace } from "@/components/ConnectedWorkspace";
export const Route = createFileRoute("/teacher/pipeline")({ component: () => <ConnectedWorkspace page="pipeline" /> });

