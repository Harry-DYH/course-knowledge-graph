import { createFileRoute } from "@tanstack/react-router";
import { ConnectedWorkspace } from "@/components/ConnectedWorkspace";
export const Route = createFileRoute("/")({ component: () => <ConnectedWorkspace page="map" /> });

