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
  member: MembersRow | null | undefined;
  createMode?: boolean;
  onAddNew?: () => void;
  onCreated?: (memberId: string) => void;
}

export function ProfileEditSheet({
  open,
  onOpenChange,
  member,
  createMode = false,
  onAddNew,
  onCreated,
}: ProfileEditSheetProps) {
  const { toast } = useToast();
  const { updateMember, createMember, deleteMember, isUpdating, isCreating, isDeleting } = useMembers();
  const { isPremium } = useSubscription();
  const [name, setName] = useState("");
  const [memberType, setMemberType] = useState<MemberTypeV2>("child");
  const [ageYears, setAgeYears] = useState(0);
  const [ageMonths, setAgeMonths] = useState(0);
  const [allergies, setAllergies] = useState<string[]>([]);
  const [allergyInput, setAllergyInput] = useState("");
  const [preferences, setPreferences] = useState<string[]>([]);
  const [preferenceInput, setPreferenceInput] = useState("");
  const [difficulty, setDifficulty] = useState<string>("easy");
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const lastInitRef = useRef<{ isCreate: boolean; memberId: string | null } | null>(null);

  const isCreate = createMode || (open && !member);

  useEffect(() => {
    if (!open) {
      lastInitRef.current = null;
      return;
    }
    const memberId = member?.id ?? null;
    const key = { isCreate, memberId };
    const sameKey = lastInitRef.current?.isCreate === key.isCreate && lastInitRef.current?.memberId === key.memberId;
    if (sameKey && !isCreate) return;
    lastInitRef.current = key;

    if (isCreate) {
      setName("");
      setMemberType("child");
      setAgeYears(0);
      setAgeMonths(0);
      setAllergies([]);
      setAllergyInput("");
      setPreferences([]);
      setPreferenceInput("");
      setDifficulty("easy");
      return;
    }
    if (!member) return;
    const total = member.age_months ?? 0;
    setMemberType((member as MembersRow).type ?? "child");
    setAgeYears(Math.floor(total / 12));
    setAgeMonths(total % 12);
    setAllergies(member.allergies ?? []);
    setAllergyInput("");
    setPreferences((member as MembersRow).preferences ?? []);
    setPreferenceInput("");
    const d = (member as MembersRow).difficulty?.trim();
    setDifficulty(d === "medium" || d === "any" ? d : "easy");
  }, [open, isCreate, member]);

  const totalAgeMonths = ageMonthsFromYearsMonths(ageYears, ageMonths);

  const allergiesHandlers = createTagListHandlers(setAllergies, setAllergyInput);
  const preferencesHandlers = createTagListHandlers(setPreferences, setPreferenceInput);

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
          ...(isPremium && { preferences, difficulty: difficulty === "any" ? "any" : difficulty === "medium" ? "medium" : "easy" }),
        });
        toast({ title: "Профиль создан", description: `«${trimmedName}» добавлен` });
        onOpenChange(false);
        onCreated?.(newMember.id as string);
      } catch (e: unknown) {
        toast({
          variant: "destructive",
          title: "Ошибка",
          description: (e as Error)?.message || "Не удалось создать профиль",
        });
      }
      return;
    }
    if (!member) return;
    try {
      await updateMember({
        id: member.id,
        type: memberType,
        age_months: totalAgeMonths || null,
        allergies,
        ...(isPremium && { preferences, difficulty: difficulty === "any" ? "any" : difficulty === "medium" ? "medium" : "easy" }),
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
    if (!member) return;
    try {
      await deleteMember(member.id);
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
          <SheetTitle>{isCreate ? "Новый профиль" : `Редактировать — ${member?.name ?? ""}`}</SheetTitle>
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
          {isPremium && (
            <>
              <TagListEditor
                label="Предпочтения в питании"
                items={preferences}
                inputValue={preferenceInput}
                onInputChange={setPreferenceInput}
                onAdd={preferencesHandlers.add}
                onEdit={preferencesHandlers.edit}
                onRemove={preferencesHandlers.remove}
                placeholder="Например: вегетарианское, быстрые блюда (запятая или Enter)"
              />
              <div className="space-y-2">
                <Label className="text-sm font-medium">Сложность блюд</Label>
                <div className="flex flex-wrap gap-2">
                  <Button
                    type="button"
                    variant={difficulty === "easy" ? "default" : "outline"}
                    size="sm"
                    onClick={() => setDifficulty("easy")}
                  >
                    Простые
                  </Button>
                  <Button
                    type="button"
                    variant={difficulty === "medium" ? "default" : "outline"}
                    size="sm"
                    onClick={() => setDifficulty("medium")}
                  >
                    Средние
                  </Button>
                  <Button
                    type="button"
                    variant={difficulty === "any" ? "default" : "outline"}
                    size="sm"
                    onClick={() => setDifficulty("any")}
                  >
                    Любые
                  </Button>
                </div>
              </div>
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
          {!isCreate && member && (
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
              Профиль «{member?.name}» будет удалён. Это действие нельзя отменить.
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
