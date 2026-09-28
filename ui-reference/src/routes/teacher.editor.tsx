import { createFileRoute } from "@tanstack/react-router";
import { ConnectedWorkspace } from "@/components/ConnectedWorkspace";
export const Route = createFileRoute("/teacher/editor")({ component: () => <ConnectedWorkspace page="editor" /> });

