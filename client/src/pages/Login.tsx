import { useState } from "react";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";

export default function Login() {
  const [, setLocation] = useLocation();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  const loginMutation = trpc.customAuth.login.useMutation({
    onSuccess: () => {
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
    <div className="medical-app login-screen min-h-dvh flex items-center justify-center bg-gradient-to-br from-[#064b49] via-[#087e78] to-[#087e78] p-4">
      <div className="w-full max-w-md">
        <div className="bg-white rounded-2xl shadow-2xl p-5 sm:p-8">
          {/* Logo */}
          <div className="flex justify-center mb-8">
            <img
              src="/logo-srougimed.png"
              alt="SrougiMed"
              className="h-auto w-full max-w-[300px] object-contain"
            />
          </div>

          {/* Formulário de Login */}
          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="space-y-2">
              <Label htmlFor="username" className="text-gray-700 font-medium">
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
              <Label htmlFor="password" className="text-gray-700 font-medium">
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
              className="w-full bg-gradient-to-r from-[#087e78] to-[#087e78] hover:from-[#064b49] hover:to-[#087e78] text-white font-semibold py-6 text-lg"
              disabled={isLoading}
            >
              {isLoading ? "Entrando..." : "Entrar"}
            </Button>
          </form>

        </div>
      </div>
    </div>
  );
}

