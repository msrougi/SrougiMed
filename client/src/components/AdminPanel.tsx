import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { Trash2, Shield, User } from "lucide-react";

export default function AdminPanel() {
  const [newUser, setNewUser] = useState({
    username: "",
    password: "",
    name: "",
    role: "user" as "admin" | "user",
  });

  const [deleteId, setDeleteId] = useState<number | null>(null);
  const [changeRoleId, setChangeRoleId] = useState<number | null>(null);
  const [newRole, setNewRole] = useState<"admin" | "user">("user");
  const [showCreateDialog, setShowCreateDialog] = useState(false);

  // Buscar usuários
  const { data: users = [], refetch } = trpc.admin.listUsers.useQuery();

  // Criar usuário
  const createMutation = trpc.admin.createUser.useMutation({
    onSuccess: () => {
      toast.success("Usuário criado com sucesso!");
      setNewUser({ username: "", password: "", name: "", role: "user" });
      setShowCreateDialog(false);
      refetch();
    },
    onError: (error) => {
      toast.error(error.message || "Erro ao criar usuário");
    },
  });

  // Deletar usuário
  const deleteMutation = trpc.admin.deleteUser.useMutation({
    onSuccess: () => {
      toast.success("Usuário deletado com sucesso!");
      setDeleteId(null);
      refetch();
    },
    onError: (error) => {
      toast.error(error.message || "Erro ao deletar usuário");
    },
  });

  // Alterar role
  const changeRoleMutation = trpc.admin.updateUserRole.useMutation({
    onSuccess: () => {
      toast.success("Nível de acesso alterado com sucesso!");
      setChangeRoleId(null);
      refetch();
    },
    onError: (error) => {
      toast.error(error.message || "Erro ao alterar nível de acesso");
    },
  });

  const handleCreateUser = (e: React.FormEvent) => {
    e.preventDefault();

    if (!newUser.username.trim()) {
      toast.error("Usuário é obrigatório");
      return;
    }

    if (!newUser.password.trim()) {
      toast.error("Senha é obrigatória");
      return;
    }

    createMutation.mutate(newUser);
  };

  const handleDelete = () => {
    if (deleteId) {
      deleteMutation.mutate(deleteId);
    }
  };

  const handleChangeRole = () => {
    if (changeRoleId) {
      changeRoleMutation.mutate({ id: changeRoleId, role: newRole });
    }
  };

  return (
    <div className="space-y-6">
      {/* Botão para criar usuário */}
      <div className="bg-white rounded-lg shadow p-6">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold text-gray-800">
            Gerenciamento de Usuários
          </h3>
          <Button
            onClick={() => setShowCreateDialog(true)}
            className="bg-[#0d9488] hover:bg-[#0d7a6d]"
          >
            Criar Novo Usuário
          </Button>
        </div>
      </div>

      {/* Lista de usuários */}
      <div className="bg-white rounded-lg shadow overflow-hidden">
        {users.length === 0 ? (
          <div className="p-6 text-center text-gray-600">
            Nenhum usuário encontrado
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Usuário</TableHead>
                <TableHead>Nome</TableHead>
                <TableHead>Nível de Acesso</TableHead>
                <TableHead>Criado em</TableHead>
                <TableHead className="text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {users.map((user) => (
                <TableRow key={user.id}>
                  <TableCell className="font-medium">{user.name || "-"}</TableCell>
                  <TableCell>{user.email || "-"}</TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      {user.role === "admin" ? (
                        <>
                          <Shield className="w-4 h-4 text-red-600" />
                          <span className="text-red-600 font-semibold">
                            Administrador
                          </span>
                        </>
                      ) : (
                        <>
                          <User className="w-4 h-4 text-blue-600" />
                          <span className="text-blue-600">Usuário</span>
                        </>
                      )}
                    </div>
                  </TableCell>
                  <TableCell>
                    {user.createdAt
                      ? new Date(user.createdAt).toLocaleDateString("pt-BR")
                      : "-"}
                  </TableCell>
                  <TableCell className="text-right space-x-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        setChangeRoleId(user.id);
                        setNewRole(user.role === "admin" ? "user" : "admin");
                      }}
                    >
                      {user.role === "admin" ? "Rebaixar" : "Promover"}
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setDeleteId(user.id)}
                      className="text-red-600 hover:text-red-700 hover:bg-red-50"
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>

      {/* Dialog para criar usuário */}
      <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Criar Novo Usuário</DialogTitle>
            <DialogDescription>
              Preencha os dados para criar um novo usuário no sistema
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleCreateUser} className="space-y-4">
            <div>
              <Label htmlFor="username">Usuário *</Label>
              <Input
                id="username"
                value={newUser.username}
                onChange={(e) =>
                  setNewUser({ ...newUser, username: e.target.value })
                }
                placeholder="Nome de usuário"
                required
              />
            </div>

            <div>
              <Label htmlFor="password">Senha *</Label>
              <Input
                id="password"
                type="password"
                value={newUser.password}
                onChange={(e) =>
                  setNewUser({ ...newUser, password: e.target.value })
                }
                placeholder="Senha"
                required
              />
            </div>

            <div>
              <Label htmlFor="name">Nome</Label>
              <Input
                id="name"
                value={newUser.name}
                onChange={(e) =>
                  setNewUser({ ...newUser, name: e.target.value })
                }
                placeholder="Nome completo"
              />
            </div>

            <div>
              <Label htmlFor="role">Nível de Acesso</Label>
              <Select
                value={newUser.role}
                onValueChange={(value) =>
                  setNewUser({
                    ...newUser,
                    role: value as "admin" | "user",
                  })
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="user">Usuário</SelectItem>
                  <SelectItem value="admin">Administrador</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="flex gap-2 justify-end pt-4">
              <Button
                type="button"
                variant="outline"
                onClick={() => setShowCreateDialog(false)}
              >
                Cancelar
              </Button>
              <Button
                type="submit"
                className="bg-[#0d9488] hover:bg-[#0d7a6d]"
                disabled={createMutation.isPending}
              >
                {createMutation.isPending ? "Criando..." : "Criar Usuário"}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* Dialog para deletar usuário */}
      <AlertDialog open={deleteId !== null} onOpenChange={(open) => {
        if (!open) setDeleteId(null);
      }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirmar Deleção</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja deletar este usuário? Esta ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="flex gap-4 justify-end">
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className="bg-red-600 hover:bg-red-700"
              disabled={deleteMutation.isPending}
            >
              {deleteMutation.isPending ? "Deletando..." : "Deletar"}
            </AlertDialogAction>
          </div>
        </AlertDialogContent>
      </AlertDialog>

      {/* Dialog para alterar role */}
      <AlertDialog open={changeRoleId !== null} onOpenChange={(open) => {
        if (!open) setChangeRoleId(null);
      }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Alterar Nível de Acesso</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja alterar o nível de acesso deste usuário para{" "}
              <strong>{newRole === "admin" ? "Administrador" : "Usuário"}</strong>?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="flex gap-4 justify-end">
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleChangeRole}
              className="bg-[#0d9488] hover:bg-[#0d7a6d]"
              disabled={changeRoleMutation.isPending}
            >
              {changeRoleMutation.isPending ? "Alterando..." : "Alterar"}
            </AlertDialogAction>
          </div>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
