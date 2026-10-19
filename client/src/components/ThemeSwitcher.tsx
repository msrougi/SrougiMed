import { Monitor, Moon, Sun } from "lucide-react";
import { useTheme } from "@/contexts/ThemeContext";
import { type ThemePreference } from "@/lib/theme";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuLabel, DropdownMenuRadioGroup, DropdownMenuRadioItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";

export function ThemeOptions() {
  const { preference, setTheme } = useTheme();
  return <>
    <DropdownMenuLabel className="px-3 text-xs text-muted-foreground">Aparência</DropdownMenuLabel>
    <DropdownMenuRadioGroup value={preference} onValueChange={value => setTheme(value as ThemePreference)}>
      {[
        { value: "light", label: "Claro", Icon: Sun },
        { value: "dark", label: "Escuro", Icon: Moon },
        { value: "system", label: "Tema do aparelho", Icon: Monitor },
      ].map(({ value, label, Icon }) => <DropdownMenuRadioItem key={value} value={value} className="min-h-11 cursor-pointer gap-2 rounded-xl pr-3">
        <Icon className="h-4 w-4" />{label}
      </DropdownMenuRadioItem>)}
    </DropdownMenuRadioGroup>
  </>;
}

export default function ThemeSwitcher() {
  const { theme } = useTheme();
  const Icon = theme === "dark" ? Moon : Sun;
  return <DropdownMenu>
    <DropdownMenuTrigger asChild>
      <Button type="button" variant="ghost" aria-label="Escolher tema" title="Escolher tema" className="h-11 w-11 rounded-xl border border-white/20 bg-white/10 p-0 text-white hover:bg-white/20 hover:text-white">
        <Icon className="h-5 w-5" />
      </Button>
    </DropdownMenuTrigger>
    <DropdownMenuContent align="end" sideOffset={8} className="w-56 max-w-[calc(100vw-2rem)] rounded-2xl p-2">
      <ThemeOptions />
    </DropdownMenuContent>
  </DropdownMenu>;
}
