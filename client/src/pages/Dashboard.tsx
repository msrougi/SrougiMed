import InstallApp from "@/components/InstallApp";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { LogOut, Users, UserPlus, Phone } from "lucide-react";
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
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[#0d9488] mx-auto mb-4"></div>
          <p className="text-gray-600">Carregando...</p>
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
    <div className="medical-app app-shell min-h-dvh bg-gray-50">
      {/* Header */}
      <header className="bg-gradient-to-r from-[#1e3a5f] to-[#0d9488] text-white shadow-lg">
        <div className="container mx-auto px-4 py-4">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex min-w-0 items-center gap-3 sm:gap-4">
              <img
                src="/logo-srougimed.png"
                alt="SrougiMed"
                className="h-10 w-20 shrink-0 object-contain bg-white rounded px-1 sm:h-12 sm:w-24"
              />
              <div>
                <h1 className="text-xl font-bold sm:text-2xl">SrougiMed</h1>
                <p className="text-xs text-gray-200 sm:text-sm">Sistema de Gestão Médica</p>
              </div>
            </div>
            <div className="flex w-full flex-col gap-3 sm:w-auto sm:flex-row sm:items-center">
              <div className="min-w-0 break-words text-left sm:max-w-60 sm:text-right">
                <p className="font-semibold">{user.name || user.username}</p>
                <p className="text-sm text-gray-200">
                  {isAdmin ? "Administrador" : "Usuário"}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <InstallApp userId={user.id} />
              <Button
                onClick={handleLogout}
                variant="outline"
                className="bg-white text-[#1e3a5f] hover:bg-gray-100"
              >
                <LogOut className="w-4 h-4 mr-2" />
                Sair
              </Button>
              </div>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="container mx-auto min-w-0 px-4 py-4 sm:py-8">
        <Tabs defaultValue="patients" className="w-full">
          <TabsList className={`grid h-auto w-full gap-1 mb-4 sm:mb-8 ${isAdmin ? "grid-cols-3" : "grid-cols-2"}`}>
            <TabsTrigger value="patients" className="flex min-h-14 min-w-0 flex-col gap-1 whitespace-normal px-1 text-xs sm:min-h-11 sm:flex-row sm:gap-2 sm:px-3 sm:text-sm">
              <UserPlus className="w-4 h-4" />
              <span className="sm:hidden">Pacientes</span><span className="hidden sm:inline">Cadastro de Pacientes</span>
            </TabsTrigger>
            <TabsTrigger value="phonebook" className="flex min-h-14 min-w-0 flex-col gap-1 whitespace-normal px-1 text-xs sm:min-h-11 sm:flex-row sm:gap-2 sm:px-3 sm:text-sm">
              <Phone className="w-4 h-4" />
              <span className="sm:hidden">Contatos</span><span className="hidden sm:inline">Agenda Telefônica</span>
            </TabsTrigger>
            {isAdmin && (
              <TabsTrigger value="admin" className="flex min-h-14 min-w-0 flex-col gap-1 whitespace-normal px-1 text-xs sm:min-h-11 sm:flex-row sm:gap-2 sm:px-3 sm:text-sm">
                <Users className="w-4 h-4" />
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
