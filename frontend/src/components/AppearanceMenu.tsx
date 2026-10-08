import { MonitorSmartphone, Moon, Palette, Sun } from "lucide-react";
import { IconButton } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { t } from "@/lib/i18n";
import { useUiPrefs, type PaletteId } from "@/lib/uiPrefs";

export function AppearanceMenu() {
  const dark = useUiPrefs((s) => s.dark);
  const toggleDark = useUiPrefs((s) => s.toggleDark);
  const chairside = useUiPrefs((s) => s.chairside);
  const toggleChairside = useUiPrefs((s) => s.toggleChairside);
  const palette = useUiPrefs((s) => s.palette);
  const setPalette = useUiPrefs((s) => s.setPalette);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <IconButton aria-label={t("appearance")} aria-haspopup="menu">
          {dark ? <Sun size={16} aria-hidden /> : <Palette size={16} aria-hidden />}
        </IconButton>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuLabel>{t("palette")}</DropdownMenuLabel>
        <DropdownMenuRadioGroup
          value={palette}
          onValueChange={(value) => setPalette(value === "sky" ? "sky" : ("demsta" satisfies PaletteId))}
        >
          <DropdownMenuRadioItem value="demsta">{t("paletteDemsta")}</DropdownMenuRadioItem>
          <DropdownMenuRadioItem value="sky">{t("paletteSky")}</DropdownMenuRadioItem>
        </DropdownMenuRadioGroup>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => toggleDark()}>
          {dark ? <Sun size={16} aria-hidden /> : <Moon size={16} aria-hidden />}
          {dark ? t("nightOn") : t("nightOff")}
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => toggleChairside()}>
          <MonitorSmartphone size={16} aria-hidden />
          {chairside ? t("chairsideOn") : t("chairsideOff")}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
