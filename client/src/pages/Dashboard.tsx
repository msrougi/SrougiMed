import { ThemeOptions } from "@/components/ThemeSwitcher";
import InstallApp from "@/components/InstallApp";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { LogOut, Users, UserPlus, Phone, UserRound, ChevronDown } from "lucide-react";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import PatientsTab from "@/components/PatientsTab";
import PhoneBookTab from "@/components/PhoneBookTab";
import AdminTab from "@/components/AdminTab";

export default function Dashboard() {
  const [, setLocation] = useLocation();
  const { data: user, isLoading } = trpc.customAuth.getCurrentUser.useQuery();
  const logoutMutation = trpc.auth.logout.useMutation({
    onSuccess: () => {
      toast.success("Logout realizado com sucesso!");
      setLocation("/");
    },
  });

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-background">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[#087e78] mx-auto mb-4"></div>
          <p className="text-gray-600 dark:text-slate-300">Carregando...</p>
        </div>
      </div>
    );
  }

  if (!user) {
    setLocation("/");
    return null;
  }

  const isAdmin = user.role === "admin";

  const handleLogout = () => {
    logoutMutation.mutate();
  };

  return (
    <div className="medical-app app-shell min-h-dvh bg-gray-50 bg-gradient-to-br from-[#087e78]/15 via-gray-50 to-[#087e78]/5 dark:bg-background dark:from-[#087e78]/20 dark:via-background dark:to-[#087e78]/5">
      <header className="rounded-b-[2rem] bg-gradient-to-br from-[#064b49] dark:from-[#082b29] via-[#087e78] dark:via-[#064b49] to-[#087e78] dark:to-[#075e59] text-white lg:rounded-none">
        <div className="container relative mx-auto flex flex-col items-center px-4 pb-12 pt-6 text-center lg:flex-row lg:justify-between lg:gap-6 lg:py-5 lg:text-left">
          <div className="flex min-w-0 flex-col items-center gap-2 lg:flex-row lg:gap-3">
            <img src="/icons/app-192.png" alt="" className="h-14 w-14 shrink-0 rounded-2xl bg-white dark:bg-card shadow-lg shadow-black/10 lg:h-12 lg:w-12 lg:rounded-xl" />
            <div>
              <h1 className="text-2xl font-semibold tracking-tight">SrougiMed</h1>
              <p className="mt-0.5 text-[11px] tracking-wide text-teal-50/75 lg:text-xs">Sistema de Gestão Médica</p>
            </div>
          </div>
          <p className="mt-3 max-w-[15rem] text-xs leading-relaxed text-white/85 lg:hidden">
            <span className="block line-clamp-2">{user.name || user.username}</span>
          </p>
          <div className="lg:flex lg:items-center lg:gap-4">
            <div className="absolute left-4 top-5 lg:static">
              <InstallApp userId={user.id} compact />
            </div>
            <div className="hidden min-w-0 max-w-52 text-right lg:block">
              <p className="break-words text-sm font-medium">{user.name || user.username}</p>
              <p className="mt-0.5 text-xs text-white/65">{isAdmin ? "Administrador" : "Usuário"}</p>
            </div>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" aria-label="Abrir menu da conta" title="Minha conta"
                  className="absolute right-4 top-5 h-11 w-11 rounded-2xl border border-white/15 bg-white/10 p-0 text-white hover:bg-white/20 hover:text-white lg:static lg:w-auto lg:gap-2 lg:rounded-xl lg:px-3">
                  <UserRound className="h-5 w-5" />
                  <ChevronDown className="hidden h-3 w-3 lg:block" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" sideOffset={10} className="w-64 max-w-[calc(100vw-2rem)] rounded-2xl p-2 shadow-xl">
                <DropdownMenuLabel className="space-y-1 px-3 py-2 font-normal">
                  <p className="break-words text-sm font-semibold [overflow-wrap:anywhere]">{user.name || user.username}</p>
                  <p className="text-xs text-slate-500 dark:text-slate-400">{isAdmin ? "Administrador" : "Usuário"}</p>
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <ThemeOptions />
                <DropdownMenuSeparator />
                <DropdownMenuItem onSelect={handleLogout} disabled={logoutMutation.isPending}
                  className="min-h-11 cursor-pointer rounded-xl px-3 text-red-700 dark:text-red-300 focus:bg-red-50 dark:focus:bg-red-950/50 focus:text-red-700 dark:focus:text-red-300">
                  <LogOut className="h-4 w-4" />
                  {logoutMutation.isPending ? "Saindo…" : "Sair da conta"}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="container relative mx-auto -mt-7 min-w-0 px-4 pb-6 lg:mt-0 lg:py-8">
        <Tabs defaultValue="patients" className="w-full">
          <TabsList className={`grid h-auto w-full gap-1 rounded-2xl border border-slate-100 dark:border-border bg-white dark:bg-card p-1.5 mb-5 shadow-lg shadow-slate-900/5 sm:mb-8 sm:shadow-sm ${isAdmin ? "grid-cols-3" : "grid-cols-2"}`}>
            <TabsTrigger value="patients" className="flex h-auto min-h-16 min-w-0 flex-col gap-1.5 rounded-xl whitespace-normal px-1 py-2 text-xs font-medium text-slate-500 dark:text-slate-400 data-[state=active]:bg-[#e8f7f5] dark:data-[state=active]:bg-teal-900/50 data-[state=active]:text-[#087e78] dark:data-[state=active]:text-teal-200 data-[state=active]:shadow-none sm:min-h-12 sm:flex-row sm:gap-2 sm:px-3 sm:text-sm">
              <UserPlus className="h-5 w-5 sm:h-4 sm:w-4" />
              <span className="sm:hidden">Pacientes</span><span className="hidden sm:inline">Cadastro de Pacientes</span>
            </TabsTrigger>
            <TabsTrigger value="phonebook" className="flex h-auto min-h-16 min-w-0 flex-col gap-1.5 rounded-xl whitespace-normal px-1 py-2 text-xs font-medium text-slate-500 dark:text-slate-400 data-[state=active]:bg-[#e8f7f5] dark:data-[state=active]:bg-teal-900/50 data-[state=active]:text-[#087e78] dark:data-[state=active]:text-teal-200 data-[state=active]:shadow-none sm:min-h-12 sm:flex-row sm:gap-2 sm:px-3 sm:text-sm">
              <Phone className="h-5 w-5 sm:h-4 sm:w-4" />
              <span className="sm:hidden">Contatos</span><span className="hidden sm:inline">Agenda Telefônica</span>
            </TabsTrigger>
            {isAdmin && (
              <TabsTrigger value="admin" className="flex h-auto min-h-16 min-w-0 flex-col gap-1.5 rounded-xl whitespace-normal px-1 py-2 text-xs font-medium text-slate-500 dark:text-slate-400 data-[state=active]:bg-[#e8f7f5] dark:data-[state=active]:bg-teal-900/50 data-[state=active]:text-[#087e78] dark:data-[state=active]:text-teal-200 data-[state=active]:shadow-none sm:min-h-12 sm:flex-row sm:gap-2 sm:px-3 sm:text-sm">
                <Users className="h-5 w-5 sm:h-4 sm:w-4" />
                Admin
              </TabsTrigger>
            )}
          </TabsList>

          <TabsContent value="patients">
            <PatientsTab />
          </TabsContent>

          <TabsContent value="phonebook">
            <PhoneBookTab />
          </TabsContent>

          {isAdmin && (
            <TabsContent value="admin">
              <AdminTab />
            </TabsContent>
          )}
        </Tabs>
      </main>
    </div>
  );
}
