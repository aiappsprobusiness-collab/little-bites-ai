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
import { ArrowLeft, Calendar, Loader2, Lock, Plus, Trash2 } from "lucide-react";
import { useMembers, birthDateToAgeMonths } from "@/hooks/useMembers";
import { useSubscription } from "@/hooks/useSubscription";
import { useToast } from "@/hooks/use-toast";
import { useAppStore } from "@/store/useAppStore";
import { getSubscriptionLimits } from "@/utils/subscriptionRules";
import type { MembersRow, AllergyItemRow } from "@/integrations/supabase/types-v2";

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
  const isFree = subscriptionStatus === "free";
  const [name, setName] = useState("");
  const [birthDate, setBirthDate] = useState("");
  const [allergyItems, setAllergyItems] = useState<AllergyItemRow[]>([]);
  const [allergyInput, setAllergyInput] = useState("");
  const [likes, setLikes] = useState<string[]>([]);
  const [likesInput, setLikesInput] = useState("");
  const [dislikes, setDislikes] = useState<string[]>([]);
  const [dislikesInput, setDislikesInput] = useState("");
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
      setLikes([]);
      setLikesInput("");
      setDislikes([]);
      setDislikesInput("");
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
    setLikes((member as MembersRow).likes ?? []);
    setLikesInput("");
    setDislikes((member as MembersRow).dislikes ?? []);
    setDislikesInput("");
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

  const MAX_CHIPS = 20;
  function normalizeChip(s: string): string {
    return s.trim().toLowerCase();
  }
  function addDedup(list: string[], toAdd: string[], max: number): string[] {
    const normalized = toAdd.map(normalizeChip).filter(Boolean);
    const set = new Set([...list.map(normalizeChip), ...normalized]);
    return Array.from(set).slice(0, max);
  }
  const openPaywallLikesDislikes = () => {
    setPaywallCustomMessage("Предпочтения (любит / не любит) и сложность блюд — в Premium.");
    setShowPaywall(true);
  };
  const LIKES_GHOST_CHIPS = ["ягоды", "рыба", "овощи"];
  const DISLIKES_GHOST_CHIPS = ["лук", "печень", "гречка"];
  const likesHandlers = {
    add: (raw: string) => {
      if (isFree) {
        openPaywallLikesDislikes();
        return;
      }
      const toAdd = parseTags(raw);
      if (toAdd.length) setLikes((prev) => addDedup(prev, toAdd, MAX_CHIPS));
      setLikesInput("");
    },
    remove: (index: number) => {
      if (isFree) {
        openPaywallLikesDislikes();
        return;
      }
      setLikes((prev) => prev.filter((_, i) => i !== index));
    },
    edit: (value: string, index: number) => {
      if (isFree) {
        openPaywallLikesDislikes();
        return;
      }
      setLikesInput(value);
      setLikes((prev) => prev.filter((_, i) => i !== index));
    },
  };
  const dislikesHandlers = {
    add: (raw: string) => {
      if (isFree) {
        openPaywallLikesDislikes();
        return;
      }
      const toAdd = parseTags(raw);
      if (toAdd.length) setDislikes((prev) => addDedup(prev, toAdd, MAX_CHIPS));
      setDislikesInput("");
    },
    remove: (index: number) => {
      if (isFree) {
        openPaywallLikesDislikes();
        return;
      }
      setDislikes((prev) => prev.filter((_, i) => i !== index));
    },
    edit: (value: string, index: number) => {
      if (isFree) {
        openPaywallLikesDislikes();
        return;
      }
      setDislikesInput(value);
      setDislikes((prev) => prev.filter((_, i) => i !== index));
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
          likes,
          dislikes,
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
          likes,
          dislikes,
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
      <div className="plan-page-bg min-h-0 flex-1 overflow-y-auto">
        <div className="px-4 py-4 max-w-lg mx-auto">
          {loading ? (
            <div className="flex justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <>
              {/* Один мягкий контейнер в стиле Plan */}
              <div className="rounded-[20px] bg-primary-light/50 border border-primary-border/80 shadow-[0_1px_8px_-2px_rgba(0,0,0,0.04)] p-5 flex flex-col gap-5">
                {/* Основное: Имя, Дата рождения */}
                <div className="flex flex-col gap-2">
                  <Label htmlFor="child-name" className="text-sm font-semibold text-foreground">
                    Имя
                  </Label>
                  <Input
                    id="child-name"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Имя ребёнка"
                    className="h-[52px] rounded-[16px] px-3 text-base border border-primary-border/60 bg-white shadow-none focus-visible:ring-2 focus-visible:ring-primary/20 focus-visible:ring-offset-0 focus-visible:border-primary/40"
                  />
                </div>
                <div className="flex flex-col gap-2">
                  <Label htmlFor="child-birth" className="text-sm font-semibold text-foreground">
                    Дата рождения
                  </Label>
                  <div className="relative">
                    <Input
                      id="child-birth"
                      type="date"
                      value={birthDate}
                      onChange={(e) => setBirthDate(e.target.value)}
                      className="h-[52px] rounded-[16px] pl-3 pr-12 text-base border border-primary-border/60 bg-white shadow-none focus-visible:ring-2 focus-visible:ring-primary/20 focus-visible:ring-offset-0 focus-visible:border-primary/40"
                    />
                    <button
                      type="button"
                      onClick={() => document.getElementById("child-birth")?.focus()}
                      className="absolute right-0 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full flex items-center justify-center text-muted-foreground hover:bg-primary-light/80 hover:text-foreground"
                      aria-label="Выбрать дату"
                    >
                      <Calendar className="w-5 h-5" />
                    </button>
                  </div>
                  <p className="text-[11px] text-muted-foreground/70 mt-0.5">
                    Возраст считается автоматически
                  </p>
                </div>

                {/* Аллергии */}
                <div className="flex flex-col gap-2">
                  <Label className="text-sm font-semibold text-foreground">Аллергии</Label>
                  {allergyItems.length > 0 && (
                    <div className="flex flex-wrap gap-2">
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
                                className="inline-flex items-center gap-1.5 h-8 rounded-full px-3 text-[13px] bg-amber-50 text-amber-800 cursor-pointer hover:bg-amber-100 border-0"
                              >
                                <span className="truncate max-w-[120px]">{item.value}</span>
                                <Lock className="w-3.5 h-3.5 shrink-0" />
                              </div>
                            ) : (
                              <div className="inline-flex items-center gap-1.5 h-8 rounded-full px-3 text-[13px] bg-primary-light/80 text-foreground border-0">
                                <span
                                  className="cursor-pointer truncate max-w-[120px]"
                                  onClick={() => allergiesHandlers.edit(item.value, i)}
                                >
                                  {item.value}
                                </span>
                                <button
                                  type="button"
                                  onClick={(e) => { e.stopPropagation(); allergiesHandlers.remove(i); }}
                                  className="w-7 h-7 rounded-full flex items-center justify-center hover:bg-primary-light shrink-0 -mr-0.5"
                                  aria-label="Удалить"
                                >
                                  <Trash2 className="w-3.5 h-3.5 text-muted-foreground" />
                                </button>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                  {isFree && activeAllergyCount >= 1 ? (
                    <>
                      <button
                        type="button"
                        onClick={() => {
                          setPaywallCustomMessage("Несколько аллергий на профиль доступны в Premium.");
                          setShowPaywall(true);
                        }}
                        className="flex h-12 items-center gap-3 px-4 rounded-2xl border border-primary-border/60 bg-white hover:bg-muted/30 transition-colors w-full text-left"
                      >
                        <div className="w-9 h-9 rounded-full bg-primary flex items-center justify-center shrink-0" aria-hidden>
                          <Plus className="w-5 h-5 text-primary-foreground" />
                        </div>
                        <span className="flex-1 min-w-0 py-2 text-[15px] font-medium text-muted-foreground">
                          Добавить аллергию
                        </span>
                      </button>
                      <p className="text-[10px] text-muted-foreground/60 truncate">
                        В Free доступна 1 аллергия
                      </p>
                    </>
                  ) : (
                    <>
                      <label htmlFor="child-allergy-add" className="flex h-12 items-center gap-3 px-4 rounded-2xl border border-primary-border/60 bg-white hover:bg-muted/30 transition-colors cursor-text w-full">
                        <div className="w-9 h-9 rounded-full bg-primary flex items-center justify-center shrink-0 pointer-events-none" aria-hidden>
                          <Plus className="w-5 h-5 text-primary-foreground" />
                        </div>
                        <input
                          id="child-allergy-add"
                          value={allergyInput}
                          onChange={(e) => setAllergyInput(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter" || e.key === ",") {
                              e.preventDefault();
                              allergiesHandlers.add(allergyInput);
                            }
                          }}
                          placeholder="Добавить аллергию"
                          className="flex-1 min-w-0 border-0 bg-transparent py-2 text-[15px] font-medium text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-0"
                        />
                      </label>
                      <p className="text-[10px] text-muted-foreground/60 truncate">
                        {!hasAccess ? "В Free доступна 1 аллергия" : "Запятая или Enter."}
                      </p>
                    </>
                  )}
                </div>

                {/* Предпочтения + Сложность: Premium/Trial — форма; Free — teaser-карточки */}
                <div className="flex flex-col gap-5">
                  {isFree ? (
                    <>
                      {/* Free: превью-карточки без инпутов */}
                      <button
                        type="button"
                        onClick={openPaywallLikesDislikes}
                        className="text-left rounded-2xl border border-primary-border/60 bg-white p-4 hover:bg-primary-light/20 hover:border-primary/30 transition-colors active:opacity-95"
                      >
                        <Label className="text-sm font-semibold text-foreground">Любит</Label>
                        <p className="text-[12px] text-muted-foreground mt-0.5">Помогает точнее подбирать рецепты</p>
                        <div className="flex flex-wrap gap-2 mt-3">
                          {LIKES_GHOST_CHIPS.map((chip) => (
                            <span key={chip} className="inline-flex h-8 items-center rounded-full px-3 text-[13px] bg-primary-light/60 text-foreground border-0">
                              {chip}
                            </span>
                          ))}
                        </div>
                        <div className="mt-3 w-full rounded-xl bg-primary/10 text-primary font-medium text-sm py-2.5 text-center">
                          ✨ Настроить (Premium)
                        </div>
                      </button>
                      <button
                        type="button"
                        onClick={openPaywallLikesDislikes}
                        className="text-left rounded-2xl border border-primary-border/60 bg-white p-4 hover:bg-primary-light/20 hover:border-primary/30 transition-colors active:opacity-95"
                      >
                        <Label className="text-sm font-semibold text-foreground">Не любит</Label>
                        <p className="text-[12px] text-muted-foreground mt-0.5">Помогает точнее подбирать рецепты</p>
                        <div className="flex flex-wrap gap-2 mt-3">
                          {DISLIKES_GHOST_CHIPS.map((chip) => (
                            <span key={chip} className="inline-flex h-8 items-center rounded-full px-3 text-[13px] bg-primary-light/60 text-foreground border-0">
                              {chip}
                            </span>
                          ))}
                        </div>
                        <div className="mt-3 w-full rounded-xl bg-primary/10 text-primary font-medium text-sm py-2.5 text-center">
                          ✨ Настроить (Premium)
                        </div>
                      </button>
                      <button
                        type="button"
                        onClick={openPaywallLikesDislikes}
                        className="text-left rounded-2xl border border-primary-border/60 bg-white p-4 hover:bg-primary-light/20 hover:border-primary/30 transition-colors active:opacity-95"
                      >
                        <Label className="text-sm font-semibold text-foreground">Сложность блюд</Label>
                        <p className="text-[12px] text-muted-foreground mt-0.5">Простые, средние или любые — настраивается в Premium</p>
                        <div className="mt-3 w-full rounded-xl bg-primary/10 text-primary font-medium text-sm py-2.5 text-center">
                          ✨ Настроить (Premium)
                        </div>
                      </button>
                    </>
                  ) : (
                    <>
                      <TagListEditor
                        label="Любит"
                        items={likes}
                        inputValue={likesInput}
                        onInputChange={setLikesInput}
                        onAdd={likesHandlers.add}
                        onEdit={likesHandlers.edit}
                        onRemove={likesHandlers.remove}
                        placeholder="Добавить (например: ягоды, рыба)"
                        unified
                        helperText={`Запятая или Enter. До ${MAX_CHIPS} пунктов.`}
                      />
                      <TagListEditor
                        label="Не любит"
                        items={dislikes}
                        inputValue={dislikesInput}
                        onInputChange={setDislikesInput}
                        onAdd={dislikesHandlers.add}
                        onEdit={dislikesHandlers.edit}
                        onRemove={dislikesHandlers.remove}
                        placeholder="Добавить (например: лук, мясо)"
                        unified
                        helperText={`Запятая или Enter. До ${MAX_CHIPS} пунктов.`}
                      />
                      <div className="flex flex-col gap-2">
                        <Label className="text-sm font-semibold text-foreground">Сложность блюд</Label>
                        <div className="flex rounded-2xl bg-primary-light/40 p-1 gap-0 border-0">
                          {[
                            { value: "easy", label: "Простые" },
                            { value: "medium", label: "Средние" },
                            { value: "any", label: "Любые" },
                          ].map((opt) => (
                            <button
                              key={opt.value}
                              type="button"
                              onClick={() => setDifficulty(opt.value)}
                              className={`flex-1 h-9 rounded-[14px] text-sm font-medium transition-colors border-0 ${
                                difficulty === opt.value
                                  ? "bg-primary text-primary-foreground shadow-sm"
                                  : "bg-transparent text-foreground hover:bg-primary-light/60"
                              }`}
                            >
                              {opt.label}
                            </button>
                          ))}
                        </div>
                      </div>
                    </>
                  )}
                </div>
              </div>

              {/* Кнопка Сохранить — как «Обновить план» */}
              <Button
                className="w-full h-12 rounded-2xl bg-primary hover:opacity-90 text-white border-0 shadow-sm font-semibold text-base mt-6"
                onClick={handleSave}
                disabled={isCreating || isUpdating}
              >
                {(isCreating || isUpdating) ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Сохраняем…
                  </>
                ) : (
                  "Сохранить изменения"
                )}
              </Button>

              {!isNew && member && (
                <Button
                  variant="ghost"
                  className="w-full h-11 rounded-2xl text-muted-foreground hover:text-destructive hover:bg-destructive/5 text-sm font-medium mt-1"
                  onClick={() => setShowDeleteConfirm(true)}
                  disabled={isDeleting}
                >
                  <Trash2 className="h-4 w-4 mr-2" />
                  Удалить профиль
                </Button>
              )}
            </>
          )}
        </div>
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
