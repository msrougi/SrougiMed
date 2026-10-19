import { useQueryClient } from "@tanstack/react-query";
import { Heart } from "lucide-react";
import ThemeSwitcher from "@/components/ThemeSwitcher";
import { DESKTOP_ONLY_ERROR } from "@shared/deviceAccess";
import { useState } from "react";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";

export default function Login() {
  const queryClient = useQueryClient();
  const [, setLocation] = useLocation();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  const loginMutation = trpc.customAuth.login.useMutation({
    onSuccess: () => {
      queryClient.clear();
      toast.success("Login realizado com sucesso!");
      setLocation("/dashboard");
    },
    onError: (error) => {
      toast.error(error.message || "Erro ao fazer login");
      setIsLoading(false);
    },
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!username || !password) {
      toast.error("Por favor, preencha todos os campos");
      return;
    }
    setIsLoading(true);
    loginMutation.mutate({ username, password });
  };

  return (
    <div className="medical-app login-screen relative min-h-dvh flex items-center justify-center bg-gradient-to-br from-[#064b49] dark:from-[#082b29] via-[#087e78] dark:via-[#064b49] to-[#087e78] dark:to-[#075e59] p-4">
      <div className="absolute right-4 top-[max(1rem,env(safe-area-inset-top))]"><ThemeSwitcher /></div>
      <div className="w-full max-w-md">
        <div className="bg-white dark:bg-card rounded-2xl shadow-2xl p-5 sm:p-8">
          {/* Logo */}
          <div className="flex justify-center mb-8">
            <img
              src="/logo-srougimed.png"
              alt="SrougiMed"
              className="h-auto w-full max-w-[300px] object-contain dark:hidden"
            />
            <div className="hidden flex-col items-center gap-3 py-4 text-center dark:flex">
              <img src="/icons/app-192.png" alt="" className="h-16 w-16 rounded-2xl" />
              <div>
                <h1 className="text-2xl font-semibold tracking-tight text-foreground">SrougiMed</h1>
                <p className="mt-1 text-xs text-muted-foreground">Sistema de Gestão Médica</p>
              </div>
            </div>
          </div>

          {/* Formulário de Login */}
          {new URLSearchParams(window.location.search).get("acesso") === "computador" && <p role="alert" className="mb-5 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-950 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-100">{DESKTOP_ONLY_ERROR}</p>}
          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="space-y-2">
              <Label htmlFor="username" className="text-gray-700 dark:text-slate-200 font-medium">
                Usuário
              </Label>
              <Input
                id="username"
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="Digite seu usuário"
                className="w-full"
                disabled={isLoading}
                autoComplete="username"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="password" className="text-gray-700 dark:text-slate-200 font-medium">
                Senha
              </Label>
              <Input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Digite sua senha"
                className="w-full"
                disabled={isLoading}
                autoComplete="current-password"
              />
            </div>

            <Button
              type="submit"
              className="w-full bg-gradient-to-r from-[#087e78] to-[#087e78] dark:to-[#075e59] hover:from-[#064b49] hover:to-[#087e78] text-white font-semibold py-6 text-lg"
              disabled={isLoading}
            >
              {isLoading ? "Entrando..." : "Entrar"}
            </Button>
          </form>

        </div>
        <p className="mt-6 flex items-center justify-center gap-1.5 text-xs text-white/80">
          Feito com <Heart className="h-3.5 w-3.5 fill-current text-red-300" aria-hidden="true" />
          <span className="sr-only">amor</span> por <span className="font-semibold text-white">Digify</span>
        </p>
      </div>
    </div>
  );
}

