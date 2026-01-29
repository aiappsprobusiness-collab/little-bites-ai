import { useEffect, useState } from "react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { X, Plus } from "lucide-react";
import { useChildren } from "@/hooks/useChildren";
import { useToast } from "@/hooks/use-toast";
import type { Tables } from "@/integrations/supabase/types";

type Child = Tables<"children">;

function birthDateFromAgeMonths(ageMonths: number): string {
  const d = new Date();
  d.setMonth(d.getMonth() - ageMonths);
  return d.toISOString().slice(0, 10);
}

function ageMonthsFromYearsMonths(years: number, months: number): number {
  return years * 12 + Math.max(0, Math.min(11, months));
}

function parseTags(s: string): string[] {
  return s
    .split(/[,;]+/)
    .map((x) => x.trim())
    .filter(Boolean);
}

interface ProfileEditSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  child: Child | null | undefined;
  /** Режим создания нового профиля (открыто по кнопке «Добавить»). */
  createMode?: boolean;
  /** Переключиться на создание нового профиля (кнопка «Добавить» внизу). */
  onAddNew?: () => void;
  /** После создания профиля — выбрать его (передать id). */
  onCreated?: (childId: string) => void;
}

export function ProfileEditSheet({
  open,
  onOpenChange,
  child,
  createMode = false,
  onAddNew,
  onCreated,
}: ProfileEditSheetProps) {
  const { toast } = useToast();
  const { updateChild, createChild, deleteChild, calculateAgeInMonths, isUpdating, isCreating, isDeleting } = useChildren();
  const [name, setName] = useState("");
  const [ageYears, setAgeYears] = useState(0);
  const [ageMonths, setAgeMonths] = useState(0);
  const [allergies, setAllergies] = useState<string[]>([]);
  const [allergyInput, setAllergyInput] = useState("");
  const [likesStr, setLikesStr] = useState("");
  const [dislikesStr, setDislikesStr] = useState("");
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  const isCreate = createMode || (open && !child);

  useEffect(() => {
    if (!open) return;
    if (isCreate) {
      setName("");
      setAgeYears(0);
      setAgeMonths(0);
      setAllergies([]);
      setAllergyInput("");
      setLikesStr("");
      setDislikesStr("");
      return;
    }
    if (!child) return;
    const totalMonths = calculateAgeInMonths(child.birth_date);
    setAgeYears(Math.floor(totalMonths / 12));
    setAgeMonths(totalMonths % 12);
    setAllergies(child.allergies ?? []);
    setAllergyInput("");
    setLikesStr((child.likes ?? []).join(", "));
    setDislikesStr((child.dislikes ?? []).join(", "));
  }, [child, open, createMode, isCreate, calculateAgeInMonths]);

  const totalAgeMonths = ageMonthsFromYearsMonths(ageYears, ageMonths);

  const addAllergy = (raw: string) => {
    const toAdd = parseTags(raw);
    if (toAdd.length) setAllergies((prev) => [...new Set([...prev, ...toAdd])]);
    setAllergyInput("");
  };

  const removeAllergy = (index: number) => {
    setAllergies((prev) => prev.filter((_, i) => i !== index));
  };

  const editAllergy = (value: string, index: number) => {
    setAllergyInput(value);
    removeAllergy(index);
  };

  const handleSave = async () => {
    if (isCreate) {
      const trimmedName = name.trim();
      if (!trimmedName) {
        toast({ variant: "destructive", title: "Введите имя" });
        return;
      }
      try {
        const newChild = await createChild({
          name: trimmedName,
          birth_date: birthDateFromAgeMonths(totalAgeMonths),
          allergies,
          likes: parseTags(likesStr),
          dislikes: parseTags(dislikesStr),
        });
        toast({ title: "Профиль создан", description: `«${trimmedName}» добавлен` });
        onOpenChange(false);
        onCreated?.(newChild.id);
      } catch (e: any) {
        toast({
          variant: "destructive",
          title: "Ошибка",
          description: e.message || "Не удалось создать профиль",
        });
      }
      return;
    }
    if (!child) return;
    try {
      console.log("[ProfileEditSheet] Сохранить изменения вызван", { id: child.id, totalAgeMonths, allergies: allergies.length });
      await updateChild({
        id: child.id,
        birth_date: birthDateFromAgeMonths(totalAgeMonths),
        allergies,
        likes: parseTags(likesStr),
        dislikes: parseTags(dislikesStr),
      });
      toast({ title: "Профиль обновлён", description: "Рекомендации учитывают новые данные." });
      onOpenChange(false);
    } catch (e: any) {
      console.error("[ProfileEditSheet] Ошибка сохранения", e);
      toast({
        variant: "destructive",
        title: "Ошибка",
        description: e.message || "Не удалось сохранить",
      });
    }
  };

  const handleDelete = async () => {
    if (!child) return;
    try {
      await deleteChild(child.id);
      toast({ title: "Профиль удалён" });
      setShowDeleteConfirm(false);
      onOpenChange(false);
    } catch (e: any) {
      toast({
        variant: "destructive",
        title: "Ошибка",
        description: e.message || "Не удалось удалить",
      });
    }
  };

  if (!open) return null;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="rounded-t-3xl flex flex-col max-h-[85vh]">
        <SheetHeader>
          <SheetTitle>{isCreate ? "Новый профиль" : `Редактировать профиль — ${child?.name ?? ""}`}</SheetTitle>
        </SheetHeader>
        <div className="space-y-5 py-4 overflow-y-auto">
          {isCreate && (
            <div className="space-y-2">
              <Label htmlFor="profile-name" className="text-sm font-medium">Имя</Label>
              <Input
                id="profile-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Имя ребёнка или семьи"
                className="h-11 border-2"
                readOnly={false}
              />
            </div>
          )}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="age-years" className="text-sm font-medium">Возраст: годы</Label>
              <Input
                id="age-years"
                type="number"
                min={0}
                max={20}
                value={ageYears === 0 ? "" : ageYears}
                onChange={(e) => setAgeYears(Math.max(0, parseInt(e.target.value, 10) || 0))}
                placeholder="0"
                className="h-11 border-2"
                readOnly={false}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="age-months" className="text-sm font-medium">Месяцы (0–11)</Label>
              <Input
                id="age-months"
                type="number"
                min={0}
                max={11}
                value={ageMonths === 0 ? "" : ageMonths}
                onChange={(e) => setAgeMonths(Math.max(0, Math.min(11, parseInt(e.target.value, 10) || 0)))}
                placeholder="0"
                className="h-11 border-2"
                readOnly={false}
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label className="text-sm font-medium">Аллергии</Label>
            <p className="text-xs text-muted-foreground">Нажмите на чип для редактирования, крестик — удалить</p>
            <div className="flex flex-wrap gap-2 mb-2">
              {allergies.map((a, i) => (
                <Badge
                  key={i}
                  variant="secondary"
                  className="cursor-pointer gap-1 pr-1"
                  onClick={() => editAllergy(a, i)}
                >
                  {a}
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      removeAllergy(i);
                    }}
                    className="rounded-full p-0.5 hover:bg-muted"
                    aria-label="Удалить"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </Badge>
              ))}
            </div>
            <Input
              value={allergyInput}
              onChange={(e) => setAllergyInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === ",") {
                  e.preventDefault();
                  addAllergy(allergyInput);
                }
              }}
              placeholder="Добавить аллергию (запятая или Enter)"
              className="h-11 border-2"
              readOnly={false}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="likes" className="text-sm font-medium">Любит (через запятую)</Label>
            <Input
              id="likes"
              value={likesStr}
              onChange={(e) => setLikesStr(e.target.value)}
              placeholder="Банан, каша, творог"
              className="h-11 border-2"
              readOnly={false}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="dislikes" className="text-sm font-medium">Не любит (через запятую)</Label>
            <Input
              id="dislikes"
              value={dislikesStr}
              onChange={(e) => setDislikesStr(e.target.value)}
              placeholder="Лук, брокколи"
              className="h-11 border-2"
              readOnly={false}
            />
          </div>
        </div>
        <div className="flex flex-col gap-2 mt-auto pt-2">
          <Button
            className="w-full h-12 text-base font-medium"
            onClick={handleSave}
            disabled={isUpdating || isCreating}
          >
            {isCreate ? "Создать профиль" : "Сохранить изменения"}
          </Button>
          {!isCreate && onAddNew && (
            <Button
              variant="outline"
              className="w-full h-11 gap-2"
              onClick={onAddNew}
            >
              <Plus className="w-4 h-4" />
              Добавить
            </Button>
          )}
          {!isCreate && child && (
            <Button
              variant="ghost"
              className="w-full h-11 text-destructive hover:text-destructive hover:bg-destructive/10"
              onClick={() => setShowDeleteConfirm(true)}
              disabled={isDeleting}
            >
              Удалить профиль
            </Button>
          )}
        </div>
      </SheetContent>
      <AlertDialog open={showDeleteConfirm} onOpenChange={setShowDeleteConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Удалить профиль?</AlertDialogTitle>
            <AlertDialogDescription>
              Профиль «{child?.name}» будет удалён. Это действие нельзя отменить.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Отмена</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Удалить
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Sheet>
  );
}
