import { useState } from "react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { LogOut, Users, UserPlus, Phone } from "lucide-react";
import PatientsTab from "@/components/PatientsTab";
import PhoneBookTab from "@/components/PhoneBookTab";
import MigrationUpload from "@/components/MigrationUpload";
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
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-gradient-to-r from-[#1e3a5f] to-[#0d9488] text-white shadow-lg">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <img
                src="/logo-srougimed.png"
                alt="SrougiMed"
                className="h-12 w-auto bg-white rounded px-2"
              />
              <div>
                <h1 className="text-2xl font-bold">SrougiMed</h1>
                <p className="text-sm text-gray-200">Sistema de Gestão Médica</p>
              </div>
            </div>
            <div className="flex items-center gap-4">
              <div className="text-right">
                <p className="font-semibold">{user.name || user.username}</p>
                <p className="text-sm text-gray-200">
                  {isAdmin ? "Administrador" : "Usuário"}
                </p>
              </div>
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
      </header>

      {/* Main Content */}
      <main className="container mx-auto px-4 py-8">
        <Tabs defaultValue="patients" className="w-full">
          <TabsList className="grid w-full grid-cols-3 mb-8">
            <TabsTrigger value="patients" className="flex items-center gap-2">
              <UserPlus className="w-4 h-4" />
              Cadastro de Pacientes
            </TabsTrigger>
            <TabsTrigger value="phonebook" className="flex items-center gap-2">
              <Phone className="w-4 h-4" />
              Agenda Telefônica
            </TabsTrigger>
            {isAdmin && (
              <TabsTrigger value="admin" className="flex items-center gap-2">
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
        <MigrationUpload />
      </main>
    </div>
  );
}
