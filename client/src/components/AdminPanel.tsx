import { updateUserSchema } from "@shared/userManagement";
import { useState, useEffect } from "react";
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
import { Trash2, Shield, User, Pencil } from "lucide-react";

export default function AdminPanel() {
  const utils = trpc.useUtils();
  const [editingUserId, setEditingUserId] = useState<number | null>(null);
  const emptyEditForm = { username: "", name: "", email: "", role: "user" as "admin" | "user", newPassword: "" };
  const [editForm, setEditForm] = useState(emptyEditForm);
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
  const listUsersMutation = trpc.admin.listUsers.useMutation();
  const [users, setUsers] = useState<any[]>([]);

  useEffect(() => {
    listUsersMutation.mutate(undefined, {
      onSuccess: (data) => {
        setUsers(data);
      }
    });
  }, []);

  const refetch = () => {
    listUsersMutation.mutate(undefined, {
      onSuccess: (data) => {
        setUsers(data);
      }
    });
  };

  const updateMutation = trpc.admin.updateUser.useMutation({
    onSuccess: () => {
      toast.success("Dados do usuário atualizados!");
      setEditingUserId(null);
      setEditForm(emptyEditForm);
      refetch();
      void utils.customAuth.getCurrentUser.invalidate();
      void utils.auth.me.invalidate();
    },
    onError: error => toast.error(error.message || "Erro ao atualizar usuário"),
  });

  const handleUpdateUser = (event: React.FormEvent) => {
    event.preventDefault();
    if (editingUserId === null || updateMutation.isPending) return;
    const parsed = updateUserSchema.safeParse({
      ...editForm, id: editingUserId,
      newPassword: editForm.newPassword === "" ? undefined : editForm.newPassword,
    });
    if (!parsed.success) { toast.error(parsed.error.issues[0].message); return; }
    updateMutation.mutate(parsed.data);
  };

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
      deleteMutation.mutate({ id: deleteId });
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
      <div className="bg-white dark:bg-card rounded-lg shadow p-4 sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h3 className="text-lg font-semibold text-gray-800 dark:text-slate-100">
            Gerenciamento de Usuários
          </h3>
          <Button
            onClick={() => setShowCreateDialog(true)}
            className="bg-[#087e78] hover:bg-[#06665f]"
          >
            Criar Novo Usuário
          </Button>
        </div>
      </div>

      {/* Lista de usuários */}
      <div className="bg-white dark:bg-card rounded-lg shadow overflow-hidden">
        {users.length === 0 ? (
          <div className="p-6 text-center text-gray-600 dark:text-slate-300">
            Nenhum usuário encontrado
          </div>
        ) : (
          <Table responsive>
            <TableHeader>
              <TableRow>
                <TableHead>Usuário</TableHead>
                <TableHead>Nome</TableHead>
                <TableHead>E-mail</TableHead>
                <TableHead>Nível de Acesso</TableHead>
                <TableHead>Criado em</TableHead>
                <TableHead className="text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {users.map((user) => (
                <TableRow key={user.id}>
                  <TableCell data-label="Usuário" className="font-medium">{user.username || "-"}</TableCell>
                  <TableCell data-label="Nome">{user.name || "-"}</TableCell>
                  <TableCell data-label="E-mail">{user.email || "-"}</TableCell>
                  <TableCell data-label="Nível de Acesso">
                    <div className="flex items-center gap-2">
                      {user.role === "admin" ? (
                        <>
                          <Shield className="w-4 h-4 text-red-600 dark:text-red-300" />
                          <span className="text-red-600 dark:text-red-300 font-semibold">
                            Administrador
                          </span>
                        </>
                      ) : (
                        <>
                          <User className="w-4 h-4 text-brand" />
                          <span className="text-brand">Usuário</span>
                        </>
                      )}
                    </div>
                  </TableCell>
                  <TableCell data-label="Criado em">
                    {user.createdAt
                      ? new Date(user.createdAt).toLocaleDateString("pt-BR")
                      : "-"}
                  </TableCell>
                  <TableCell data-label="Ações" className="record-actions text-right space-x-2">
                    <Button variant="ghost" size="sm" className="text-brand" aria-label="Editar usuário" title="Editar usuário"
                      onClick={() => {
                        setEditForm({ username: user.username || "", name: user.name || "", email: user.email || "", role: user.role, newPassword: "" });
                        setEditingUserId(user.id);
                      }}>
                      <Pencil className="h-4 w-4" /><span className="ml-1">Editar</span>
                    </Button>
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
                      className="text-red-600 dark:text-red-300 hover:text-red-700 dark:hover:text-red-300 hover:bg-red-50 dark:hover:bg-red-950/50"
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

      <Dialog open={editingUserId !== null} onOpenChange={open => {
        if (!open && !updateMutation.isPending) { setEditingUserId(null); setEditForm(emptyEditForm); }
      }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Editar usuário</DialogTitle>
            <DialogDescription>Atualize os dados. Deixe a nova senha vazia para manter a atual.</DialogDescription>
          </DialogHeader>
          <form onSubmit={handleUpdateUser} className="space-y-4">
            <div>
              <Label htmlFor="edit-user-name">Nome</Label>
              <Input id="edit-user-name" value={editForm.name} maxLength={200} autoComplete="off" disabled={updateMutation.isPending}
                onChange={event => setEditForm({ ...editForm, name: event.target.value })} />
            </div>
            <div>
              <Label htmlFor="edit-user-username">Usuário / login *</Label>
              <Input id="edit-user-username" value={editForm.username} maxLength={100} required autoComplete="off" disabled={updateMutation.isPending}
                onChange={event => setEditForm({ ...editForm, username: event.target.value })} />
            </div>
            <div>
              <Label htmlFor="edit-user-email">E-mail</Label>
              <Input id="edit-user-email" type="email" value={editForm.email} maxLength={320} autoComplete="off" disabled={updateMutation.isPending}
                onChange={event => setEditForm({ ...editForm, email: event.target.value })} />
            </div>
            <div>
              <Label htmlFor="edit-user-role">Nível de acesso</Label>
              <Select value={editForm.role} disabled={updateMutation.isPending} onValueChange={value => setEditForm({ ...editForm, role: value as "admin" | "user" })}>
                <SelectTrigger id="edit-user-role"><SelectValue /></SelectTrigger>
                <SelectContent><SelectItem value="user">Usuário</SelectItem><SelectItem value="admin">Administrador</SelectItem></SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="edit-user-password">Nova senha</Label>
              <Input id="edit-user-password" type="password" value={editForm.newPassword} maxLength={72} autoComplete="new-password"
                placeholder="Deixe vazio para manter a senha" disabled={updateMutation.isPending}
                aria-describedby="edit-user-password-help" onChange={event => setEditForm({ ...editForm, newPassword: event.target.value })} />
              <p id="edit-user-password-help" className="mt-2 text-xs text-muted-foreground">Para trocar, informe pelo menos 8 caracteres.</p>
            </div>
            <div className="flex flex-wrap justify-end gap-2 pt-4">
              <Button type="button" variant="outline" disabled={updateMutation.isPending} onClick={() => { setEditingUserId(null); setEditForm(emptyEditForm); }}>Cancelar</Button>
              <Button type="submit" disabled={updateMutation.isPending}>{updateMutation.isPending ? "Salvando…" : "Salvar alterações"}</Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

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

            <div className="flex flex-wrap gap-2 justify-end pt-4">
              <Button
                type="button"
                variant="outline"
                onClick={() => setShowCreateDialog(false)}
              >
                Cancelar
              </Button>
              <Button
                type="submit"
                className="bg-[#087e78] hover:bg-[#06665f]"
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
          <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
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
          <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleChangeRole}
              className="bg-[#087e78] hover:bg-[#06665f]"
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
