import { useEffect, useState, useRef, useMemo } from "react";
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
import { ArrowLeft, Calendar, Loader2, Plus, Trash2, User, UtensilsCrossed, Heart } from "lucide-react";
import { useMembers, birthDateToAgeMonths, ageMonthsToBirthDate, memberTypeFromAgeMonths, formatAgeFromMonths } from "@/hooks/useMembers";
import { useSubscription } from "@/hooks/useSubscription";
import { useToast } from "@/hooks/use-toast";
import { useAppStore } from "@/store/useAppStore";
import { getSubscriptionLimits } from "@/utils/subscriptionRules";
import { normalizeAllergyToken } from "@/utils/allergyAliases";
import { PreferenceChip } from "@/components/profile/PreferenceChip";
import { FF_AUTO_FILL_AFTER_MEMBER_CREATE } from "@/config/featureFlags";
import { startFillDay, setJustCreatedMemberId, getPlanUrlForMember } from "@/services/planFill";
import type { MembersRow, AllergyItemRow } from "@/integrations/supabase/types-v2";

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
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showExitConfirm, setShowExitConfirm] = useState(false);
  const initRef = useRef(false);
  const allowNavigationRef = useRef(false);
  const savedSuccessfullyRef = useRef(false);

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
      initRef.current = true;
      return;
    }
    if (!member) return;
    initRef.current = true;
    setName(member.name ?? "");
    setBirthDate(ageMonthsToBirthDate(member.age_months ?? null));
    const rawItems = (member as MembersRow).allergy_items ?? (member.allergies ?? []).map((value, sort_order) => ({ value, is_active: true, sort_order }));
    const items = rawItems.map((item, sort_order) => ({
      ...item,
      value: normalizeAllergyToken(item.value),
      sort_order,
    }));
    setAllergyItems(items);
    setAllergyInput("");
    setLikes((member as MembersRow).likes ?? []);
    setLikesInput("");
    setDislikes((member as MembersRow).dislikes ?? []);
    setDislikesInput("");
  }, [isNew, id, member?.id]);

  const allergiesHandlers = {
    add: (raw: string) => {
      const toAdd = parseTags(raw);
      if (!toAdd.length) return;
      if (activeAllergyCount >= limits.maxAllergiesPerProfile) {
        setPaywallCustomMessage("Аллергии и исключения — в Trial");
        setShowPaywall(true);
        return;
      }
      const nextActive = hasAccess ? true : activeAllergyCount === 0;
      const existing = allergyItems.map((i) => i.value.toLowerCase());
      const normalized = toAdd.map((v) => normalizeAllergyToken(v));
      const newItems = normalized.filter((v) => !existing.includes(v.toLowerCase())).map((value, i) => ({
        value,
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
        setPaywallCustomMessage("Аллергии и исключения — в Trial");
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
    setPaywallCustomMessage("Предпочтения (любит / не любит) — в Premium.");
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

  const hasChanges = useMemo(() => {
    if (isNew) {
      return Boolean(
        name.trim() ||
        birthDate ||
        allergyItems.length > 0 ||
        likes.length > 0 ||
        dislikes.length > 0
      );
    }
    if (!member) return false;
    const origName = (member.name ?? "").trim();
    const origBirth = ageMonthsToBirthDate(member.age_months ?? null);
    const origItems = (member as MembersRow).allergy_items ?? (member.allergies ?? []).map((value, sort_order) => ({ value, is_active: true, sort_order }));
    const origLikes = (member as MembersRow).likes ?? [];
    const origDislikes = (member as MembersRow).dislikes ?? [];
    if (name.trim() !== origName || birthDate !== origBirth) return true;
    if (allergyItems.length !== origItems.length) return true;
    for (let i = 0; i < allergyItems.length; i++) {
      if (allergyItems[i].value !== origItems[i]?.value || allergyItems[i].is_active !== origItems[i]?.is_active) return true;
    }
    if (likes.length !== origLikes.length || dislikes.length !== origDislikes.length) return true;
    const toKey = (a: string[]) => [...a].sort().join(",");
    if (toKey(likes) !== toKey(origLikes) || toKey(dislikes) !== toKey(origDislikes)) return true;
    return false;
  }, [isNew, member, name, birthDate, allergyItems, likes, dislikes]);

  const handleSave = async () => {
    const trimmedName = name.trim();
    if (!trimmedName) {
      toast({ variant: "destructive", title: "Введите имя" });
      return;
    }
    if (!birthDate?.trim()) {
      toast({ variant: "destructive", title: "Укажите дату рождения" });
      return;
    }
    if (activeAllergyCount > limits.maxAllergiesPerProfile) {
      setPaywallCustomMessage("Аллергии и исключения — в Trial");
      setShowPaywall(true);
      return;
    }
    try {
      if (isNew) {
        const type = memberTypeFromAgeMonths(ageMonths);
        const newMember = await createMember({
          name: trimmedName,
          type,
          age_months: ageMonths || null,
          allergy_items: allergyItems.length ? allergyItems : undefined,
          allergies: allergyItems.filter((i) => i.is_active).map((i) => i.value),
        ...(limits.preferencesEnabled && {
          likes,
          dislikes,
        }),
      });
      toast({ title: "Профиль сохранён" });
        savedSuccessfullyRef.current = true;
        allowNavigationRef.current = true;
        if (FF_AUTO_FILL_AFTER_MEMBER_CREATE) {
          try {
            await startFillDay(newMember.id);
            setJustCreatedMemberId(newMember.id);
            navigate(getPlanUrlForMember(newMember.id), { replace: true });
          } catch (fillError) {
            toast({
              variant: "destructive",
              title: "Ошибка",
              description: "Не удалось подобрать меню. Попробуйте снова.",
            });
            navigate("/profile", { replace: true });
          }
        } else {
          navigate("/profile", { replace: true });
        }
        return;
      }
      if (!member) return;
      const derivedType = memberTypeFromAgeMonths(ageMonths);
      const typeToSave = (member as MembersRow).type === "family" ? "family" : derivedType;
      await updateMember({
        id: member.id,
        name: trimmedName,
        type: typeToSave,
        age_months: ageMonths || null,
        allergy_items: allergyItems.length ? allergyItems : undefined,
        allergies: allergyItems.filter((i) => i.is_active).map((i) => i.value),
        ...(limits.preferencesEnabled && {
          likes,
          dislikes,
        }),
      });
      toast({ title: "Профиль сохранён" });
      savedSuccessfullyRef.current = true;
      allowNavigationRef.current = true;
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

  const handleBack = () => {
    if (allowNavigationRef.current || savedSuccessfullyRef.current) {
      navigate("/profile", { replace: true });
      return;
    }
    if (hasChanges) {
      setShowExitConfirm(true);
      return;
    }
    navigate("/profile", { replace: true });
  };

  const handleExitWithoutSaving = () => {
    allowNavigationRef.current = true;
    setShowExitConfirm(false);
    navigate("/profile", { replace: true });
  };

  useEffect(() => {
    if (!hasChanges) return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [hasChanges]);

  const hasPushedStateRef = useRef(false);
  useEffect(() => {
    if (!hasChanges) {
      hasPushedStateRef.current = false;
      return;
    }
    if (hasPushedStateRef.current) return;
    hasPushedStateRef.current = true;
    window.history.pushState(null, "", window.location.pathname);
    const onPopState = () => {
      if (allowNavigationRef.current || savedSuccessfullyRef.current) return;
      setShowExitConfirm(true);
      window.history.pushState(null, "", window.location.pathname);
    };
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, [hasChanges]);

  return (
    <MobileLayout
      title="Профиль"
      headerLeft={
        <Button variant="ghost" size="icon" className="h-10 w-10" onClick={handleBack} aria-label="Назад">
          <ArrowLeft className="h-5 w-5" />
        </Button>
      }
    >
      <div className="profile-edit-page flex flex-col flex-1 min-h-0">
        <div className="flex-1 min-h-0 overflow-y-auto">
          <div className="px-4 py-5 pb-32 max-w-lg mx-auto flex flex-col gap-8">
          {loading ? (
            <div className="flex justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <>
              {/* Hero: профильный блок */}
              <div className="rounded-2xl bg-gradient-to-b from-[#F8F6F1] to-[#F3F0E9] border border-border/60 px-5 py-5 flex items-center gap-4">
                <div className="w-14 h-14 rounded-full bg-white/90 border border-border/80 shadow-sm flex items-center justify-center shrink-0 text-[#5A6B3D] text-xl font-semibold">
                  {name.trim() ? (name.trim()[0].toUpperCase()) : <User className="w-7 h-7 text-muted-foreground" />}
                </div>
                <div className="min-w-0 flex-1">
                  <h2 className="text-lg font-semibold text-foreground truncate">
                    {name.trim() || "Новый профиль"}
                  </h2>
                  <p className="text-[13px] text-muted-foreground mt-0.5">
                    {isNew ? "Профиль ребёнка" : "Редактирование профиля"}
                  </p>
                  {ageMonths != null && ageMonths >= 0 && birthDate?.trim() && (
                    <span className="inline-block mt-2 px-2.5 py-0.5 rounded-full bg-white/80 border border-border/60 text-[12px] font-medium text-foreground/90">
                      {formatAgeFromMonths(ageMonths)}
                    </span>
                  )}
                </div>
              </div>

              {/* Карточка 1 — Основная информация */}
              <div className="bg-background rounded-2xl p-5 shadow-sm border border-border">
                <div className="flex items-center gap-2 mb-4">
                  <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
                    <User className="w-4 h-4 text-primary" />
                  </div>
                  <div>
                    <h3 className="text-base font-semibold text-foreground leading-tight">Основная информация</h3>
                    <p className="text-[12px] text-muted-foreground mt-0.5">Имя и дата рождения</p>
                  </div>
                </div>
                <div className="space-y-4">
                  <div className="space-y-1.5">
                    <Label htmlFor="child-name" className="text-[13px] font-medium text-muted-foreground">Имя</Label>
                    <Input
                      id="child-name"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      placeholder="Имя"
                      className="h-11 border border-input bg-background rounded-xl text-[15px] placeholder:text-muted-foreground/70"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="child-birth" className="text-[13px] font-medium text-muted-foreground">Дата рождения <span className="text-destructive">*</span></Label>
                    <div className="date-input-wrap relative rounded-xl border border-input bg-background">
                      <Input
                        id="child-birth"
                        type="date"
                        value={birthDate}
                        onChange={(e) => setBirthDate(e.target.value)}
                        className="h-11 min-h-0 border-0 bg-transparent rounded-xl pl-3 pr-12 text-[15px] focus-visible:ring-0 focus-visible:ring-offset-0"
                      />
                      <button
                        type="button"
                        onClick={() => document.getElementById("child-birth")?.focus()}
                        className="absolute right-0 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full flex items-center justify-center text-muted-foreground hover:text-foreground"
                        aria-label="Выбрать дату"
                      />
                    </div>
                    <p className="text-[12px] text-muted-foreground">
                      Возраст рассчитывается автоматически по дате рождения
                    </p>
                    {ageMonths != null && ageMonths >= 0 && birthDate?.trim() && (
                      <span className="inline-flex items-center mt-1.5 px-2.5 py-1 rounded-lg bg-primary/10 text-[12px] font-medium text-primary">
                        {formatAgeFromMonths(ageMonths)}
                      </span>
                    )}
                  </div>
                </div>
              </div>

              {/* Карточка 2 — Пищевые особенности */}
              <div className="bg-background rounded-2xl p-5 shadow-sm border border-border">
                <div className="flex items-center gap-2 mb-4">
                  <div className="w-8 h-8 rounded-lg bg-amber-500/10 flex items-center justify-center">
                    <UtensilsCrossed className="w-4 h-4 text-amber-700/80" />
                  </div>
                  <div>
                    <h3 className="text-base font-semibold text-foreground leading-tight">Пищевые особенности</h3>
                    <p className="text-[12px] text-muted-foreground mt-0.5">То, что важно учитывать при подборе блюд</p>
                  </div>
                </div>
                <div className="space-y-3">
                  {allergyItems.length > 0 && (
                    <div className="flex flex-wrap gap-2">
                      {allergyItems.map((item, i) => {
                        const isLocked = !hasAccess && !item.is_active;
                        return (
                          <span key={i} className="profile-tag-enter">
                            <PreferenceChip
                              label={item.value}
                              variant="allergy"
                              locked={isLocked}
                              onLockedClick={isLocked ? () => { setPaywallCustomMessage("Аллергии и исключения — в Trial"); setShowPaywall(true); } : undefined}
                              removable={!isLocked}
                              onRemove={!isLocked ? () => allergiesHandlers.remove(i) : undefined}
                            />
                          </span>
                        );
                      })}
                    </div>
                  )}
                  {isFree && activeAllergyCount >= 1 ? (
                    <>
                      <button
                        type="button"
                        onClick={() => { setPaywallCustomMessage("Аллергии и исключения — в Trial"); setShowPaywall(true); }}
                        className="flex h-11 w-full items-center justify-center gap-2 rounded-xl border border-border bg-muted/30 font-medium text-sm text-muted-foreground hover:bg-muted/50"
                      >
                        <Plus className="w-5 h-5" />
                        Добавить аллергию
                      </button>
                      <p className="text-[12px] text-muted-foreground">
                        В Free доступна 1 аллергия
                      </p>
                    </>
                  ) : (
                    <>
                      <form
                        className="flex h-11 items-center gap-3 px-4 rounded-xl border border-input bg-background hover:border-primary/30 transition-colors cursor-text w-full"
                        onSubmit={(e) => {
                          e.preventDefault();
                          if (allergyInput.trim()) allergiesHandlers.add(allergyInput);
                        }}
                        noValidate
                      >
                        <button
                          type="button"
                          className="w-8 h-8 rounded-full flex items-center justify-center shrink-0 bg-[#7A8F4D] text-white hover:opacity-90 disabled:opacity-50"
                          onClick={() => allergyInput.trim() && allergiesHandlers.add(allergyInput)}
                          disabled={!allergyInput.trim()}
                          aria-label="Добавить"
                        >
                          <Plus className="w-4 h-4" />
                        </button>
                        <input
                          id="child-allergy-add"
                          type="text"
                          autoComplete="off"
                          value={allergyInput}
                          onChange={(e) => setAllergyInput(e.target.value)}
                          onKeyDown={(e) => {
                            const isEnter = e.key === "Enter" || (e as React.KeyboardEvent<HTMLInputElement>).keyCode === 13;
                            if (isEnter || e.key === ",") {
                              e.preventDefault();
                              allergiesHandlers.add(allergyInput);
                            }
                          }}
                          placeholder="Добавить аллергию"
                          className="flex-1 min-w-0 border-0 bg-transparent py-2 text-[15px] font-medium text-foreground focus:outline-none focus:ring-0 placeholder:text-muted-foreground/70"
                        />
                      </form>
                      <p className="text-[12px] text-muted-foreground">
                        {!hasAccess ? "В Free доступна 1 аллергия" : "Можно вводить через запятую или Enter"}
                      </p>
                    </>
                  )}
                </div>
              </div>

              {/* Карточка 3 — Предпочтения */}
              <div className="bg-background rounded-2xl p-5 shadow-sm border border-border">
                <div className="flex items-center gap-2 mb-4">
                  <div className="w-8 h-8 rounded-lg bg-emerald-500/10 flex items-center justify-center">
                    <Heart className="w-4 h-4 text-emerald-700/80" />
                  </div>
                  <div>
                    <h3 className="text-base font-semibold text-foreground leading-tight">Предпочтения</h3>
                    <p className="text-[12px] text-muted-foreground mt-0.5">Любит и не любит — для точного подбора рецептов</p>
                  </div>
                </div>
                {isFree ? (
                  <>
                    <button
                      type="button"
                      onClick={openPaywallLikesDislikes}
                      className="text-left w-full rounded-xl border border-border bg-muted/20 p-4 hover:bg-muted/40 transition-colors"
                    >
                      <p className="text-sm font-medium text-foreground">Любит</p>
                      <div className="flex flex-wrap gap-2 mt-2">
                        {LIKES_GHOST_CHIPS.map((chip) => (
                          <PreferenceChip key={chip} label={chip} variant="like" />
                        ))}
                      </div>
                      <div className="mt-3 w-full rounded-xl py-2.5 text-center text-sm font-medium border border-border text-muted-foreground">
                        ✨ Настроить (Premium)
                      </div>
                    </button>
                    <div className="h-px bg-border my-4" />
                    <button
                      type="button"
                      onClick={openPaywallLikesDislikes}
                      className="text-left w-full rounded-xl border border-border bg-muted/20 p-4 hover:bg-muted/40 transition-colors"
                    >
                      <p className="text-sm font-medium text-foreground">Не любит</p>
                      <div className="flex flex-wrap gap-2 mt-2">
                        {DISLIKES_GHOST_CHIPS.map((chip) => (
                          <PreferenceChip key={chip} label={chip} variant="dislike" />
                        ))}
                      </div>
                      <div className="mt-3 w-full rounded-xl py-2.5 text-center text-sm font-medium border border-border text-muted-foreground">
                        ✨ Настроить (Premium)
                      </div>
                    </button>
                  </>
                ) : (
                  <div className="space-y-6">
                    <TagListEditor
                      id="profile-likes"
                      label="Любит"
                      chipVariant="like"
                      items={likes}
                      inputValue={likesInput}
                      onInputChange={setLikesInput}
                      onAdd={likesHandlers.add}
                      onEdit={likesHandlers.edit}
                      onRemove={likesHandlers.remove}
                      placeholder="Например: ягоды, рыба"
                      helperText="Запятая или Enter"
                    />
                    <TagListEditor
                      id="profile-dislikes"
                      label="Не любит"
                      chipVariant="dislike"
                      items={dislikes}
                      inputValue={dislikesInput}
                      onInputChange={setDislikesInput}
                      onAdd={dislikesHandlers.add}
                      onEdit={dislikesHandlers.edit}
                      onRemove={dislikesHandlers.remove}
                      placeholder="Например: лук, мясо"
                      helperText="Запятая или Enter"
                    />
                  </div>
                )}

                {!isNew && member && (
                  <div className="mt-6 pt-4 border-t border-border/60">
                    <Button
                      variant="ghost"
                      className="w-full h-10 text-[13px] text-muted-foreground hover:text-[#9B6B6B] hover:bg-muted/40 font-medium rounded-xl"
                      onClick={() => setShowDeleteConfirm(true)}
                      disabled={isDeleting}
                    >
                      <Trash2 className="h-4 w-4 mr-2 opacity-60" />
                      Удалить профиль
                    </Button>
                  </div>
                )}
              </div>
            </>
          )}
          </div>
        </div>

        {!loading && (
          <div className="flex-shrink-0 border-t border-border/80 bg-background/98 backdrop-blur-sm shadow-[0_-2px_14px_rgba(0,0,0,0.05)] px-4 pt-4 pb-4">
            <div className="max-w-lg mx-auto">
              <Button
                className="w-full py-4 bg-[#7A8F4D] hover:bg-[#6a7e41] hover:opacity-95 active:scale-[0.98] text-white border-0 rounded-xl font-semibold text-[15px] shadow-[0_2px_10px_rgba(122,143,77,0.22)] transition-all duration-200 disabled:opacity-50"
                onClick={handleSave}
                disabled={isCreating || isUpdating || !hasChanges || !birthDate?.trim()}
              >
                {(isCreating || isUpdating) ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  "Сохранить"
                )}
              </Button>
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

      <AlertDialog open={showExitConfirm} onOpenChange={setShowExitConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Сохранить изменения перед выходом?</AlertDialogTitle>
            <AlertDialogDescription>
              Изменения в профиле не сохранены. Вы можете сохранить их или выйти без сохранения.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setShowExitConfirm(false)}>Остаться</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleExitWithoutSaving}
              className="bg-muted text-muted-foreground hover:bg-muted/80"
            >
              Выйти без сохранения
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </MobileLayout>
  );
}
