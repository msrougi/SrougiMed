import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";

interface PhoneBookFormProps {
  onSuccess?: () => void;
}

export default function PhoneBookForm({ onSuccess }: PhoneBookFormProps) {
  const [formData, setFormData] = useState({
    name: "",
    email: "",
    occupation: "",
    category: "",
    phone: "",
    observations: "",
  });

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

  // Formatar telefone enquanto digita - (XX) XXXXX-XXXX (celular com 11 dígitos)
  const handlePhoneChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    let value = e.target.value;

    // Se vazio, permite deleção completa
    if (value === "") {
      setFormData({ ...formData, phone: "" });
      return;
    }

    // Remove tudo que não é dígito
    let digitsOnly = value.replace(/\D/g, "");

    // Limita a 11 dígitos
    if (digitsOnly.length > 11) {
      digitsOnly = digitsOnly.slice(0, 11);
    }

    // Formata como (XX) XXXXX-XXXX
    let formatted = digitsOnly;
    if (digitsOnly.length >= 2) {
      formatted = "(" + digitsOnly.slice(0, 2) + ")";
    }
    if (digitsOnly.length >= 3) {
      formatted = "(" + digitsOnly.slice(0, 2) + ") " + digitsOnly.slice(2);
    }
    if (digitsOnly.length >= 7) {
      formatted = "(" + digitsOnly.slice(0, 2) + ") " + digitsOnly.slice(2, 7) + "-" + digitsOnly.slice(7);
    }

    setFormData({ ...formData, phone: formatted });
  };

  const handleInputChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>
  ) => {
    const { name, value } = e.target;
    setFormData({ ...formData, [name]: value });
  };

  const resetForm = () => {
    setFormData({
      name: "",
      email: "",
      occupation: "",
      category: "",
      phone: "",
      observations: "",
    });
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.name.trim()) {
      toast.error("Nome é obrigatório");
      return;
    }

    createMutation.mutate({
      name: formData.name,
      email: formData.email || undefined,
      occupation: formData.occupation || undefined,
      category: formData.category || undefined,
      phone: formData.phone || undefined,
      observations: formData.observations || undefined,
    });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div className="bg-white rounded-lg shadow p-6">
        <h3 className="text-lg font-semibold text-gray-800 mb-4">
          Novo Contato
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
              onChange={handlePhoneChange}
              placeholder="(00) 00000-0000"
              maxLength={15}
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
            <div className="text-sm text-gray-500 mt-1">
              {formData.observations.length}/2000 caracteres
            </div>
          </div>
        </div>
      </div>

      <div className="flex gap-4">
        <Button
          type="submit"
          className="flex-1 bg-[#0d9488] hover:bg-[#0d7a6d]"
          disabled={createMutation.isPending}
        >
          {createMutation.isPending ? "Salvando..." : "Cadastrar Contato"}
        </Button>
        <Button
          type="button"
          variant="outline"
          onClick={resetForm}
          disabled={createMutation.isPending}
        >
          Limpar
        </Button>
      </div>
    </form>
  );
}
