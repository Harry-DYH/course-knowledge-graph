import { createFileRoute } from "@tanstack/react-router";
import { ConnectedWorkspace } from "@/components/ConnectedWorkspace";
export const Route = createFileRoute("/learn/ask")({ component: () => <ConnectedWorkspace page="ask" /> });

