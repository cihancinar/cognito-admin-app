import { AppSidebar } from "@/components/app-sidebar";
import { CognitoManager } from "@/components/cognito-manager";
import {
  SidebarInset,
  SidebarProvider,
} from "@/components/ui/sidebar";

export default function Page() {
  return (
    <SidebarProvider>
      <AppSidebar />
      <SidebarInset>
        <div className="flex flex-1 flex-col gap-4 p-4 pt-0">
          <CognitoManager />
        </div>
      </SidebarInset>
    </SidebarProvider>
  );
}
