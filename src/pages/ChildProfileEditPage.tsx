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
import { getSubscriptionLimits } from "@/utils/subscriptionRules";
import type { MembersRow, AllergyItemRow } from "@/integrations/supabase/types-v2";
import { Lock } from "lucide-react";

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
  const { subscriptionStatus, hasAccess } = useSubscription();
  const setShowPaywall = useAppStore((s) => s.setShowPaywall);
  const setPaywallCustomMessage = useAppStore((s) => s.setPaywallCustomMessage);
  const limits = getSubscriptionLimits(subscriptionStatus);
  const [name, setName] = useState("");
  const [birthDate, setBirthDate] = useState("");
  const [allergyItems, setAllergyItems] = useState<AllergyItemRow[]>([]);
  const [allergyInput, setAllergyInput] = useState("");
  const [preferences, setPreferences] = useState<string[]>([]);
  const [preferenceInput, setPreferenceInput] = useState("");
  const [difficulty, setDifficulty] = useState<string>("easy");
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const initRef = useRef(false);

  const isNew = id === "new";
  const member = !isNew && id ? members.find((m) => m.id === id) : null;
  const activeAllergyCount = allergyItems.filter((i) => i.is_active).length;

  useEffect(() => {
    if (isNew) {
      setName("");
      setBirthDate("");
      setAllergyItems([]);
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
    const items = (member as MembersRow).allergy_items ?? (member.allergies ?? []).map((value, sort_order) => ({ value, is_active: true, sort_order }));
    setAllergyItems(items);
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
      if (activeAllergyCount >= limits.maxAllergiesPerProfile) {
        setPaywallCustomMessage("Несколько аллергий на профиль доступны в Premium.");
        setShowPaywall(true);
        return;
      }
      const nextActive = hasAccess ? true : activeAllergyCount === 0;
      const existing = allergyItems.map((i) => i.value.toLowerCase());
      const newItems = toAdd.filter((v) => !existing.includes(v.trim().toLowerCase())).map((value, i) => ({
        value: value.trim(),
        is_active: nextActive && i === 0,
        sort_order: allergyItems.length + i,
      }));
      if (newItems.length) setAllergyItems((prev) => [...prev, ...newItems]);
      setAllergyInput("");
    },
    remove: (index: number) => setAllergyItems((prev) => prev.filter((_, i) => i !== index)),
    edit: (value: string, index: number) => {
      setAllergyInput(value);
      setAllergyItems((prev) => prev.filter((_, i) => i !== index));
    },
    setActive: (index: number, active: boolean) => {
      if (!hasAccess && active) {
        setPaywallCustomMessage("Несколько аллергий на профиль доступны в Premium.");
        setShowPaywall(true);
        return;
      }
      setAllergyItems((prev) => prev.map((item, i) => (i === index ? { ...item, is_active: active } : item)));
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
    if (activeAllergyCount > limits.maxAllergiesPerProfile) {
      setPaywallCustomMessage("Несколько аллергий на профиль доступны в Premium.");
      setShowPaywall(true);
      return;
    }
    try {
      if (isNew) {
        const newMember = await createMember({
          name: trimmedName,
          type: "child",
          age_months: ageMonths || null,
          allergy_items: allergyItems.length ? allergyItems : undefined,
          allergies: allergyItems.filter((i) => i.is_active).map((i) => i.value),
        ...(limits.preferencesEnabled && {
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
        allergy_items: allergyItems.length ? allergyItems : undefined,
        allergies: allergyItems.filter((i) => i.is_active).map((i) => i.value),
        ...(limits.preferencesEnabled && {
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

            <div className="space-y-2">
              <Label className="text-typo-muted font-medium">Аллергии</Label>
              <p className="text-typo-caption text-muted-foreground">
                Нажмите на чип для редактирования, крестик — удалить. {!hasAccess && "Активна одна аллергия — остальные в Premium."}
              </p>
              <div className="flex flex-wrap gap-2 mb-2">
                {allergyItems.map((item, i) => {
                  const isLocked = !hasAccess && !item.is_active;
                  return (
                    <div key={i} className="relative">
                      {isLocked ? (
                        <div
                          role="button"
                          tabIndex={0}
                          onClick={() => {
                            setPaywallCustomMessage("Несколько аллергий на профиль доступны в Premium.");
                            setShowPaywall(true);
                          }}
                          onKeyDown={(e) => e.key === "Enter" && (setPaywallCustomMessage("Несколько аллергий на профиль доступны в Premium."), setShowPaywall(true))}
                          className="inline-flex items-center gap-1 rounded-md border border-amber-200 bg-amber-50/80 px-2 py-1 text-sm text-amber-800 cursor-pointer hover:bg-amber-100/80"
                        >
                          {item.value}
                          <Lock className="w-3.5 h-3.5 shrink-0" />
                        </div>
                      ) : (
                        <div className="inline-flex items-center gap-1 rounded-md border bg-secondary px-2 py-1 text-sm pr-1">
                          <span
                            className="cursor-pointer"
                            onClick={() => allergiesHandlers.edit(item.value, i)}
                          >
                            {item.value}
                          </span>
                          <button
                            type="button"
                            onClick={(e) => { e.stopPropagation(); allergiesHandlers.remove(i); }}
                            className="rounded-full p-0.5 hover:bg-muted"
                            aria-label="Удалить"
                          >
                            <Trash2 className="w-3 h-3" />
                          </button>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
              <div className="flex gap-2">
                <Input
                  value={allergyInput}
                  onChange={(e) => setAllergyInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === ",") {
                      e.preventDefault();
                      allergiesHandlers.add(allergyInput);
                    }
                  }}
                  placeholder="Добавить аллергию (запятая или Enter)"
                  className="h-11 rounded-xl"
                />
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  className="h-11 w-11 shrink-0 rounded-xl"
                  onClick={() => allergiesHandlers.add(allergyInput)}
                  aria-label="Добавить"
                >
                  +
                </Button>
              </div>
            </div>

            <div className={limits.preferencesEnabled ? "" : "relative"}>
              {!limits.preferencesEnabled && (
                <div
                  className="absolute inset-0 z-10 flex items-center justify-center rounded-2xl bg-background/80 backdrop-blur-[1px]"
                  onClick={() => {
                    setPaywallCustomMessage("Предпочтения (любит / не любит) и сложность блюд — в Premium.");
                    setShowPaywall(true);
                  }}
                >
                  <Button type="button" variant="secondary" size="sm" className="pointer-events-none">
                    Доступно в Premium
                  </Button>
                </div>
              )}
              <div className={limits.preferencesEnabled ? "" : "pointer-events-none select-none opacity-70"}>
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
                <div className="space-y-2 mt-4">
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
              </div>
            </div>

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
