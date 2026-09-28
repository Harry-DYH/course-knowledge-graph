import {createFileRoute} from "@tanstack/react-router";
import {ConnectedWorkspace} from "@/components/ConnectedWorkspace";
export const Route=createFileRoute("/learn/quiz")({component:()=> <ConnectedWorkspace page="quiz"/>});
