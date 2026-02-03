import { useEffect, useRef, useState, type Dispatch, type SetStateAction } from "react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { TagListEditor } from "@/components/ui/tag-list-editor";
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
import { Plus } from "lucide-react";
import { useMembers } from "@/hooks/useMembers";
import { useSubscription } from "@/hooks/useSubscription";
import { useToast } from "@/hooks/use-toast";
import type { MembersRow, MemberTypeV2 } from "@/integrations/supabase/types-v2";

function ageMonthsFromYearsMonths(years: number, months: number): number {
  return years * 12 + Math.max(0, Math.min(11, months));
}

function parseTags(s: string): string[] {
  return s
    .split(/[,;]+/)
    .map((x) => x.trim())
    .filter(Boolean);
}

type SetList = Dispatch<SetStateAction<string[]>>;
type SetInput = Dispatch<SetStateAction<string>>;

function createTagListHandlers(
  setList: SetList,
  setInput: SetInput
): { add: (raw: string) => void; remove: (index: number) => void; edit: (value: string, index: number) => void } {
  const remove = (index: number) => setList((prev) => prev.filter((_, i) => i !== index));
  return {
    add: (raw: string) => {
      const toAdd = parseTags(raw);
      if (toAdd.length) setList((prev) => [...new Set([...prev, ...toAdd])]);
      setInput("");
    },
    remove,
    edit: (value: string, index: number) => {
      setInput(value);
      remove(index);
    },
  };
}

interface ProfileEditSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  child: MembersRow | null | undefined;
  createMode?: boolean;
  onAddNew?: () => void;
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
  const { subscriptionStatus } = useSubscription();
  const { updateMember, createMember, deleteMember, isUpdating, isCreating, isDeleting } = useMembers();
  const isFree = subscriptionStatus === "free";
  const [name, setName] = useState("");
  const [memberType, setMemberType] = useState<MemberTypeV2>("child");
  const [ageYears, setAgeYears] = useState(0);
  const [ageMonths, setAgeMonths] = useState(0);
  const [allergies, setAllergies] = useState<string[]>([]);
  const [allergyInput, setAllergyInput] = useState("");
  const [likes, setLikes] = useState<string[]>([]);
  const [likeInput, setLikeInput] = useState("");
  const [dislikes, setDislikes] = useState<string[]>([]);
  const [dislikeInput, setDislikeInput] = useState("");
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const lastInitRef = useRef<{ isCreate: boolean; childId: string | null } | null>(null);

  const isCreate = createMode || (open && !child);

  useEffect(() => {
    if (!open) {
      lastInitRef.current = null;
      return;
    }
    const childId = child?.id ?? null;
    const key = { isCreate, childId };
    const sameKey = lastInitRef.current?.isCreate === key.isCreate && lastInitRef.current?.childId === key.childId;
    if (sameKey && !isCreate) return;
    lastInitRef.current = key;

    if (isCreate) {
      setName("");
      setMemberType("child");
      setAgeYears(0);
      setAgeMonths(0);
      setAllergies([]);
      setAllergyInput("");
      setLikes([]);
      setLikeInput("");
      setDislikes([]);
      setDislikeInput("");
      return;
    }
    if (!child) return;
    const total = child.age_months ?? 0;
    setMemberType((child as MembersRow).type ?? "child");
    setAgeYears(Math.floor(total / 12));
    setAgeMonths(total % 12);
    setAllergies(child.allergies ?? []);
    setAllergyInput("");
    setLikes(child.likes ?? []);
    setLikeInput("");
    setDislikes(child.dislikes ?? []);
    setDislikeInput("");
  }, [open, isCreate, child]);

  const totalAgeMonths = ageMonthsFromYearsMonths(ageYears, ageMonths);

  const allergiesHandlers = createTagListHandlers(setAllergies, setAllergyInput);
  const likesHandlers = createTagListHandlers(setLikes, setLikeInput);
  const dislikesHandlers = createTagListHandlers(setDislikes, setDislikeInput);

  const handleSave = async () => {
    if (isCreate) {
      const trimmedName = name.trim();
      if (!trimmedName) {
        toast({ variant: "destructive", title: "Введите имя" });
        return;
      }
      try {
        const newMember = await createMember({
          name: trimmedName,
          type: memberType,
          age_months: totalAgeMonths || null,
          allergies,
          likes,
          dislikes,
        });
        toast({ title: "Профиль создан", description: `«${trimmedName}» добавлен` });
        onOpenChange(false);
        onCreated?.(newMember.id);
      } catch (e: unknown) {
        toast({
          variant: "destructive",
          title: "Ошибка",
          description: (e as Error)?.message || "Не удалось создать профиль",
        });
      }
      return;
    }
    if (!child) return;
    try {
      await updateMember({
        id: child.id,
        type: memberType,
        age_months: totalAgeMonths || null,
        allergies,
        likes,
        dislikes,
      });
      toast({ title: "Профиль обновлён", description: "Рекомендации учитывают новые данные." });
      onOpenChange(false);
    } catch (e: unknown) {
      toast({
        variant: "destructive",
        title: "Ошибка",
        description: (e as Error)?.message || "Не удалось сохранить",
      });
    }
  };

  const handleDelete = async () => {
    if (!child) return;
    try {
      await deleteMember(child.id);
      toast({ title: "Профиль удалён" });
      setShowDeleteConfirm(false);
      onOpenChange(false);
    } catch (e: unknown) {
      toast({
        variant: "destructive",
        title: "Ошибка",
        description: (e as Error)?.message || "Не удалось удалить",
      });
    }
  };

  if (!open) return null;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="rounded-t-3xl flex flex-col max-h-[85vh]" aria-describedby="profile-sheet-desc">
        <p id="profile-sheet-desc" className="sr-only">Редактирование профиля</p>
        <SheetHeader>
          <SheetTitle>{isCreate ? "Новый профиль" : `Редактировать — ${child?.name ?? ""}`}</SheetTitle>
        </SheetHeader>
        <div className="space-y-5 py-4 overflow-y-auto">
          {isCreate && (
            <>
              <div className="space-y-2">
                <Label htmlFor="profile-name" className="text-sm font-medium">Имя</Label>
                <Input
                  id="profile-name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Имя ребёнка или взрослого"
                  className="h-11 border-2"
                />
              </div>
              <div className="space-y-2">
                <Label className="text-sm font-medium">Тип</Label>
                <div className="flex gap-2">
                  <Button
                    type="button"
                    variant={memberType === "child" ? "default" : "outline"}
                    size="sm"
                    onClick={() => setMemberType("child")}
                  >
                    Ребёнок
                  </Button>
                  <Button
                    type="button"
                    variant={memberType === "adult" ? "default" : "outline"}
                    size="sm"
                    onClick={() => setMemberType("adult")}
                  >
                    Взрослый
                  </Button>
                </div>
              </div>
            </>
          )}
          {!isCreate && (
            <div className="space-y-2">
              <Label className="text-sm font-medium">Тип</Label>
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant={memberType === "child" ? "default" : "outline"}
                  size="sm"
                  onClick={() => setMemberType("child")}
                >
                  Ребёнок
                </Button>
                <Button
                  type="button"
                  variant={memberType === "adult" ? "default" : "outline"}
                  size="sm"
                  onClick={() => setMemberType("adult")}
                >
                  Взрослый
                </Button>
              </div>
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
              />
            </div>
          </div>
          <TagListEditor
            label="Аллергии"
            items={allergies}
            inputValue={allergyInput}
            onInputChange={setAllergyInput}
            onAdd={allergiesHandlers.add}
            onEdit={allergiesHandlers.edit}
            onRemove={allergiesHandlers.remove}
            placeholder="Добавить аллергию (запятая или Enter)"
          />
          {isFree ? (
            <>
              <div className="space-y-2 opacity-60 pointer-events-none">
                <Label className="text-sm font-medium">Любит</Label>
                <p className="text-xs text-muted-foreground">Доступно в Premium</p>
                <div className="flex flex-wrap gap-2 min-h-9 rounded-md border border-input bg-muted/30 px-3 py-2" />
              </div>
              <div className="space-y-2 opacity-60 pointer-events-none">
                <Label className="text-sm font-medium">Не любит</Label>
                <p className="text-xs text-muted-foreground">Доступно в Premium</p>
                <div className="flex flex-wrap gap-2 min-h-9 rounded-md border border-input bg-muted/30 px-3 py-2" />
              </div>
            </>
          ) : (
            <>
              <TagListEditor
                label="Любит"
                items={likes}
                inputValue={likeInput}
                onInputChange={setLikeInput}
                onAdd={likesHandlers.add}
                onEdit={likesHandlers.edit}
                onRemove={likesHandlers.remove}
              />
              <TagListEditor
                label="Не любит"
                items={dislikes}
                inputValue={dislikeInput}
                onInputChange={setDislikeInput}
                onAdd={dislikesHandlers.add}
                onEdit={dislikesHandlers.edit}
                onRemove={dislikesHandlers.remove}
              />
            </>
          )}
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
            <Button variant="outline" className="w-full h-11 gap-2" onClick={onAddNew}>
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
