import { useEffect, useState, useRef } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { MobileLayout } from "@/components/layout/MobileLayout";
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
import { ArrowLeft, Loader2, Trash2 } from "lucide-react";
import { useMembers, birthDateToAgeMonths } from "@/hooks/useMembers";
import { useSubscription } from "@/hooks/useSubscription";
import { useToast } from "@/hooks/use-toast";
import { useAppStore } from "@/store/useAppStore";
import type { MembersRow } from "@/integrations/supabase/types-v2";

function ageMonthsToBirthDate(ageMonths: number | null): string {
  if (ageMonths == null || ageMonths < 0) return "";
  const d = new Date();
  d.setMonth(d.getMonth() - ageMonths);
  return d.toISOString().slice(0, 10);
}

function parseTags(s: string): string[] {
  return s
    .split(/[,;]+/)
    .map((x) => x.trim())
    .filter(Boolean);
}

export default function ChildProfileEditPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { toast } = useToast();
  const { members, createMember, updateMember, deleteMember, isCreating, isUpdating, isDeleting } = useMembers();
  const { isPremium, hasAccess } = useSubscription();
  const setShowPaywall = useAppStore((s) => s.setShowPaywall);
  const [name, setName] = useState("");
  const [birthDate, setBirthDate] = useState("");
  const [allergies, setAllergies] = useState<string[]>([]);
  const [allergyInput, setAllergyInput] = useState("");
  const [preferences, setPreferences] = useState<string[]>([]);
  const [preferenceInput, setPreferenceInput] = useState("");
  const [difficulty, setDifficulty] = useState<string>("easy");
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const initRef = useRef(false);

  const isNew = id === "new";
  const member = !isNew && id ? members.find((m) => m.id === id) : null;

  useEffect(() => {
    if (isNew) {
      setName("");
      setBirthDate("");
      setAllergies([]);
      setAllergyInput("");
      setPreferences([]);
      setPreferenceInput("");
      setDifficulty("easy");
      initRef.current = true;
      return;
    }
    if (!member) return;
    initRef.current = true;
    setName(member.name ?? "");
    setBirthDate(ageMonthsToBirthDate(member.age_months ?? null));
    setAllergies(member.allergies ?? []);
    setAllergyInput("");
    setPreferences((member as MembersRow).preferences ?? []);
    setPreferenceInput("");
    const d = (member as MembersRow).difficulty?.trim();
    setDifficulty(d === "medium" || d === "any" ? d : "easy");
  }, [isNew, id, member?.id]);

  const allergiesHandlers = {
    add: (raw: string) => {
      const toAdd = parseTags(raw);
      if (!toAdd.length) return;
      if (!hasAccess && allergies.length >= 1) {
        setShowPaywall(true);
        return;
      }
      setAllergies((prev) => [...new Set([...prev, ...toAdd])]);
      setAllergyInput("");
    },
    remove: (index: number) => setAllergies((prev) => prev.filter((_, i) => i !== index)),
    edit: (value: string, index: number) => {
      setAllergyInput(value);
      setAllergies((prev) => prev.filter((_, i) => i !== index));
    },
  };

  const preferencesHandlers = {
    add: (raw: string) => {
      const toAdd = parseTags(raw);
      if (toAdd.length) setPreferences((prev) => [...new Set([...prev, ...toAdd])]);
      setPreferenceInput("");
    },
    remove: (index: number) => setPreferences((prev) => prev.filter((_, i) => i !== index)),
    edit: (value: string, index: number) => {
      setPreferenceInput(value);
      setPreferences((prev) => prev.filter((_, i) => i !== index));
    },
  };

  const ageMonths = birthDate ? birthDateToAgeMonths(birthDate) : null;

  const handleSave = async () => {
    const trimmedName = name.trim();
    if (!trimmedName) {
      toast({ variant: "destructive", title: "Введите имя" });
      return;
    }
    try {
      if (isNew) {
        const newMember = await createMember({
          name: trimmedName,
          type: "child",
          age_months: ageMonths || null,
          allergies,
          ...(hasAccess && {
            preferences,
            difficulty: difficulty === "any" ? "any" : difficulty === "medium" ? "medium" : "easy",
          }),
        });
        toast({ title: "Профиль создан", description: `«${trimmedName}» добавлен` });
        navigate("/profile", { replace: true });
        return;
      }
      if (!member) return;
      await updateMember({
        id: member.id,
        name: trimmedName,
        age_months: ageMonths || null,
        allergies,
        ...(hasAccess && {
          preferences,
          difficulty: difficulty === "any" ? "any" : difficulty === "medium" ? "medium" : "easy",
        }),
      });
      toast({ title: "Профиль обновлён", description: "Данные сохранены" });
      navigate("/profile", { replace: true });
    } catch (e: unknown) {
      toast({
        variant: "destructive",
        title: "Ошибка",
        description: (e as Error)?.message ?? "Не удалось сохранить",
      });
    }
  };

  const handleDelete = async () => {
    if (!member) return;
    try {
      await deleteMember(member.id);
      toast({ title: "Профиль удалён" });
      setShowDeleteConfirm(false);
      navigate("/profile", { replace: true });
    } catch (e: unknown) {
      toast({
        variant: "destructive",
        title: "Ошибка",
        description: (e as Error)?.message ?? "Не удалось удалить",
      });
    }
  };

  const loading = !isNew && id && members.length > 0 && !member;

  useEffect(() => {
    if (!isNew && id && members.length > 0 && !member) {
      navigate("/profile", { replace: true });
    }
  }, [isNew, id, members.length, member, navigate]);

  return (
    <MobileLayout
      title={isNew ? "Новый ребёнок" : "Редактировать"}
      headerLeft={
        <Button variant="ghost" size="icon" className="h-10 w-10" onClick={() => navigate("/profile")}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
      }
    >
      <div className="px-4 py-6 max-w-lg mx-auto">
        {loading ? (
          <div className="flex justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="space-y-6">
            <div className="space-y-2">
              <Label htmlFor="child-name">Имя</Label>
              <Input
                id="child-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Имя ребёнка"
                className="h-11 rounded-xl"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="child-birth">Дата рождения</Label>
              <Input
                id="child-birth"
                type="date"
                value={birthDate}
                onChange={(e) => setBirthDate(e.target.value)}
                className="h-11 rounded-xl"
              />
              <p className="text-typo-caption text-muted-foreground">
                Возраст считается автоматически
              </p>
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

            {hasAccess && (
              <>
                <TagListEditor
                  label="Предпочтения в питании"
                  items={preferences}
                  inputValue={preferenceInput}
                  onInputChange={setPreferenceInput}
                  onAdd={preferencesHandlers.add}
                  onEdit={preferencesHandlers.edit}
                  onRemove={preferencesHandlers.remove}
                  placeholder="Например: вегетарианское (запятая или Enter)"
                />
                <div className="space-y-2">
                  <Label>Сложность блюд</Label>
                  <div className="flex flex-wrap gap-2">
                    {[
                      { value: "easy", label: "Простые" },
                      { value: "medium", label: "Средние" },
                      { value: "any", label: "Любые" },
                    ].map((opt) => (
                      <Button
                        key={opt.value}
                        type="button"
                        variant={difficulty === opt.value ? "default" : "outline"}
                        size="sm"
                        onClick={() => setDifficulty(opt.value)}
                      >
                        {opt.label}
                      </Button>
                    ))}
                  </div>
                </div>
              </>
            )}

            <div className="flex flex-col gap-3 pt-4">
              <Button
                className="w-full h-12 rounded-xl font-medium"
                onClick={handleSave}
                disabled={isCreating || isUpdating}
              >
                {(isCreating || isUpdating) ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Сохранить
                  </>
                ) : (
                  "Сохранить"
                )}
              </Button>

              {!isNew && member && (
                <Button
                  variant="ghost"
                  className="w-full h-11 text-destructive hover:bg-destructive/10"
                  onClick={() => setShowDeleteConfirm(true)}
                  disabled={isDeleting}
                >
                  <Trash2 className="h-4 w-4 mr-2" />
                  Удалить профиль
                </Button>
              )}
            </div>
          </div>
        )}
      </div>

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
    </MobileLayout>
  );
}
