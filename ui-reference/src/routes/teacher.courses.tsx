import { createFileRoute } from "@tanstack/react-router";
import { ConnectedWorkspace } from "@/components/ConnectedWorkspace";
export const Route = createFileRoute("/teacher/courses")({ component: () => <ConnectedWorkspace page="courses" /> });

