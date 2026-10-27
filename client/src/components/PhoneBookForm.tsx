import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";

interface PhoneBookFormProps {
  onSuccess?: () => void;
  initialData?: (Partial<Record<keyof typeof defaultFormData, string | null>> & { id?: number }) | null;
}

const defaultFormData = {
  name: "",
  email: "",
  occupation: "",
  category: "",
  phone: "",
  observations: "",
};

function contactFormData(initialData?: PhoneBookFormProps["initialData"]) {
  // Normalize before the first render: an effect is too late for .length and
  // controlled inputs. Keep existing strings exactly as stored.
  return Object.fromEntries(Object.entries(defaultFormData).map(([key,value])=>[
    key,initialData?.[key as keyof typeof defaultFormData] ?? value,
  ])) as typeof defaultFormData;
}

export default function PhoneBookForm({ onSuccess, initialData }: PhoneBookFormProps) {
  const [formData, setFormData] = useState(() => contactFormData(initialData));

  const createMutation = trpc.phoneBook.create.useMutation({
    onSuccess: () => {
      toast.success("Contato cadastrado com sucesso!");
      resetForm();
      onSuccess?.();
    },
    onError: (error) => {
      toast.error(error.message || "Erro ao cadastrar contato");
    },
  });

  const updateMutation = trpc.phoneBook.update.useMutation({
    onSuccess: () => {
      toast.success("Contato atualizado com sucesso!");
      resetForm();
      onSuccess?.();
    },
    onError: (error) => {
      toast.error(error.message || "Erro ao atualizar contato");
    },
  });

  // Carregar dados iniciais se for edição
  useEffect(() => {
    setFormData(contactFormData(initialData));
  }, [initialData]);



  const handleInputChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>
  ) => {
    const { name, value } = e.target;
    setFormData({ ...formData, [name]: value });
  };

  const resetForm = () => {
    setFormData(defaultFormData);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.name.trim()) {
      toast.error("Nome é obrigatório");
      return;
    }

    const submitData = {
      name: formData.name,
      email: formData.email || undefined,
      occupation: formData.occupation || undefined,
      category: formData.category || undefined,
      phone: formData.phone || undefined,
      observations: formData.observations || undefined,
    };

    // Se tem ID, é atualização, senão é criação
    if (initialData?.id) {
      updateMutation.mutate({ id: initialData.id, data: submitData });
    } else {
      createMutation.mutate(submitData);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div className="bg-white dark:bg-card rounded-lg shadow p-4 sm:p-6">
        <h3 className="text-lg font-semibold text-gray-800 dark:text-slate-100 mb-4">
          {initialData?.id ? "Editar Contato" : "Novo Contato"}
        </h3>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="md:col-span-2">
            <Label htmlFor="name">Nome *</Label>
            <Input
              id="name"
              name="name"
              value={formData.name}
              onChange={handleInputChange}
              placeholder="Nome completo"
              maxLength={200}
              required
            />
          </div>

          <div>
            <Label htmlFor="email">E-mail</Label>
            <Input
              id="email"
              name="email"
              type="email"
              value={formData.email}
              onChange={handleInputChange}
              placeholder="email@exemplo.com"
              maxLength={200}
            />
          </div>

          <div>
            <Label htmlFor="phone">Telefone</Label>
            <Input
              id="phone"
              name="phone"
              value={formData.phone}
              onChange={handleInputChange}
              placeholder="Telefone"
              type="tel"
            />
          </div>

          <div>
            <Label htmlFor="occupation">Ocupação</Label>
            <Input
              id="occupation"
              name="occupation"
              value={formData.occupation}
              onChange={handleInputChange}
              placeholder="Profissão/Ocupação"
              maxLength={200}
            />
          </div>

          <div>
            <Label htmlFor="category">Categoria</Label>
            <Input
              id="category"
              name="category"
              value={formData.category}
              onChange={handleInputChange}
              placeholder="Categoria"
              maxLength={200}
            />
          </div>

          <div className="md:col-span-2">
            <Label htmlFor="observations">Observações</Label>
            <Textarea
              id="observations"
              name="observations"
              value={formData.observations}
              onChange={handleInputChange}
              placeholder="Observações adicionais"
              maxLength={2000}
              rows={4}
            />
            <div className="text-sm text-gray-500 dark:text-slate-400 mt-1">
              {formData.observations.length}/2000 caracteres
            </div>
          </div>
        </div>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:gap-4">
        <Button
          type="submit"
          className="flex-1 bg-[#087e78] hover:bg-[#06665f]"
          disabled={createMutation.isPending || updateMutation.isPending}
        >
          {createMutation.isPending || updateMutation.isPending
            ? "Salvando..."
            : initialData?.id ? "Atualizar Contato" : "Cadastrar Contato"}
        </Button>
        <Button
          type="button"
          variant="outline"
          onClick={resetForm}
          disabled={createMutation.isPending || updateMutation.isPending}
        >
          Limpar
        </Button>
      </div>
    </form>
  );
}
