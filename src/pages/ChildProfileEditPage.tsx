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
import { ArrowLeft, Loader2, Plus, Trash2, UtensilsCrossed } from "lucide-react";
import { useMembers, birthDateToAgeMonths, ageMonthsToBirthDate, memberTypeFromAgeMonths, formatAgeFromMonths } from "@/hooks/useMembers";
import { useSubscription } from "@/hooks/useSubscription";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { useAppStore } from "@/store/useAppStore";
import { getSubscriptionLimits } from "@/utils/subscriptionRules";
import {
  FREE_ALLERGY_PAYWALL_MESSAGE,
  PREMIUM_PROFILES_MAX_BODY,
  PREMIUM_PROFILES_MAX_TITLE,
} from "@/utils/friendlyLimitCopy";
import { normalizeAllergyToken } from "@/utils/allergyAliases";
import { getProductDisplayLabel, normalizeProductKeys } from "@/utils/introducedProducts";
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
  const { authReady } = useAuth();
  const setShowPaywall = useAppStore((s) => s.setShowPaywall);
  const setPaywallCustomMessage = useAppStore((s) => s.setPaywallCustomMessage);
  const setPaywallReason = useAppStore((s) => s.setPaywallReason);
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
  const [introducedProductKeys, setIntroducedProductKeys] = useState<string[]>([]);
  const [introducedProductsInput, setIntroducedProductsInput] = useState("");
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showExitConfirm, setShowExitConfirm] = useState(false);
  const initRef = useRef(false);
  const allowNavigationRef = useRef(false);
  const savedSuccessfullyRef = useRef(false);

  const isNew = id === "new";
  const member = !isNew && id ? members.find((m) => m.id === id) : null;
  const activeAllergyCount = allergyItems.filter((i) => i.is_active).length;

  useEffect(() => {
    if (!isNew || !authReady) return;
    const lim = getSubscriptionLimits(subscriptionStatus);
    if (members.length >= lim.maxProfiles) {
      navigate("/profile", { replace: true });
      if (hasAccess) {
        toast({
          title: PREMIUM_PROFILES_MAX_TITLE,
          description: PREMIUM_PROFILES_MAX_BODY.replace(/\n/g, " "),
        });
      } else {
        setPaywallReason("add_child_limit");
        setPaywallCustomMessage(null);
        setShowPaywall(true);
      }
    }
  }, [isNew, authReady, members.length, subscriptionStatus, hasAccess, navigate, toast, setPaywallReason, setPaywallCustomMessage, setShowPaywall]);

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
      setIntroducedProductKeys([]);
      setIntroducedProductsInput("");
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
    setIntroducedProductKeys((member as MembersRow).introduced_product_keys ?? []);
    setIntroducedProductsInput("");
  }, [isNew, id, member?.id]);

  const allergiesHandlers = {
    add: (raw: string) => {
      const toAdd = parseTags(raw);
      if (!toAdd.length) return;
      if (activeAllergyCount >= limits.maxAllergiesPerProfile) {
        if (hasAccess) {
          toast({
            title: "Лимит аллергий",
            description: `Можно указать до ${limits.maxAllergiesPerProfile} аллергий на профиль.`,
          });
          return;
        }
        setPaywallReason("allergies_locked");
        setPaywallCustomMessage(FREE_ALLERGY_PAYWALL_MESSAGE);
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
        setPaywallReason("allergies_locked");
        setPaywallCustomMessage(FREE_ALLERGY_PAYWALL_MESSAGE);
        setShowPaywall(true);
        return;
      }
      setAllergyItems((prev) => prev.map((item, i) => (i === index ? { ...item, is_active: active } : item)));
    },
  };

  const INTRO_PRODUCTS_MAX = 20;
  function normalizeChip(s: string): string {
    return s.trim().toLowerCase();
  }
  function addDedup(list: string[], toAdd: string[], max: number): string[] {
    const normalized = toAdd.map(normalizeChip).filter(Boolean);
    const set = new Set([...list.map(normalizeChip), ...normalized]);
    return Array.from(set).slice(0, max);
  }
  const openPaywallLikesDislikes = () => {
    setPaywallReason("preferences_locked");
    setPaywallCustomMessage(null);
    setShowPaywall(true);
  };
  const LIKES_GHOST_CHIPS = ["ягоды", "рыба", "овощи"];
  const DISLIKES_GHOST_CHIPS = ["лук", "печень", "гречка"];

  const ALLERGY_SUGGESTIONS = ["БКМ", "орехи", "яйца", "рыба", "глютен"];
  const LIKES_SUGGESTIONS = ["ягоды", "банан", "курица", "рыба", "макароны"];
  const DISLIKES_SUGGESTIONS = ["лук", "грибы", "каша", "рыба", "творог"];
  const allergyValuesSet = useMemo(() => new Set(allergyItems.map((i) => i.value.toLowerCase())), [allergyItems]);
  const likesSet = useMemo(() => new Set(likes.map(normalizeChip)), [likes]);
  const dislikesSet = useMemo(() => new Set(dislikes.map(normalizeChip)), [dislikes]);
  const likesHandlers = {
    add: (raw: string) => {
      if (isFree) {
        openPaywallLikesDislikes();
        return;
      }
      const toAdd = parseTags(raw);
      if (toAdd.length) setLikes((prev) => addDedup(prev, toAdd, limits.maxLikesTagsPerProfile));
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
      if (toAdd.length) setDislikes((prev) => addDedup(prev, toAdd, limits.maxDislikesTagsPerProfile));
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
  const introducedHandlers = {
    add: (raw: string) => {
      const toAdd = parseTags(raw);
      if (!toAdd.length) return;
      const normalized = normalizeProductKeys(toAdd);
      if (!normalized.length) {
        toast({
          description:
            "Не удалось распознать продукт по этому названию. Попробуйте другое слово (например: кабачок, яблоко).",
        });
        setIntroducedProductsInput("");
        return;
      }
      setIntroducedProductKeys((prev) => addDedup(prev, normalized, INTRO_PRODUCTS_MAX));
      setIntroducedProductsInput("");
    },
    remove: (index: number) => {
      setIntroducedProductKeys((prev) => prev.filter((_, i) => i !== index));
    },
    edit: (value: string, index: number) => {
      setIntroducedProductsInput(getProductDisplayLabel(value));
      setIntroducedProductKeys((prev) => prev.filter((_, i) => i !== index));
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
        || introducedProductKeys.length > 0
      );
    }
    if (!member) return false;
    const origName = (member.name ?? "").trim();
    const origBirth = ageMonthsToBirthDate(member.age_months ?? null);
    const origItems = (member as MembersRow).allergy_items ?? (member.allergies ?? []).map((value, sort_order) => ({ value, is_active: true, sort_order }));
    const origLikes = (member as MembersRow).likes ?? [];
    const origDislikes = (member as MembersRow).dislikes ?? [];
    const origIntroduced = (member as MembersRow).introduced_product_keys ?? [];
    if (name.trim() !== origName || birthDate !== origBirth) return true;
    if (allergyItems.length !== origItems.length) return true;
    for (let i = 0; i < allergyItems.length; i++) {
      if (allergyItems[i].value !== origItems[i]?.value || allergyItems[i].is_active !== origItems[i]?.is_active) return true;
    }
    if (likes.length !== origLikes.length || dislikes.length !== origDislikes.length || introducedProductKeys.length !== origIntroduced.length) return true;
    const toKey = (a: string[]) => [...a].sort().join(",");
    if (
      toKey(likes) !== toKey(origLikes) ||
      toKey(dislikes) !== toKey(origDislikes) ||
      toKey(introducedProductKeys) !== toKey(origIntroduced)
    ) return true;
    return false;
  }, [isNew, member, name, birthDate, allergyItems, likes, dislikes, introducedProductKeys]);

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
      if (hasAccess) {
        toast({
          variant: "destructive",
          title: "Слишком много аллергий",
          description: `Оставьте не больше ${limits.maxAllergiesPerProfile} активных аллергий.`,
        });
        return;
      }
      setPaywallReason("allergies_locked");
      setPaywallCustomMessage(FREE_ALLERGY_PAYWALL_MESSAGE);
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
        introduced_product_keys: introducedProductKeys,
      });
      toast({ title: "Профиль сохранён" });
        savedSuccessfullyRef.current = true;
        allowNavigationRef.current = true;
        setShowExitConfirm(false);
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
        introduced_product_keys: introducedProductKeys,
      });
      toast({ title: "Профиль сохранён" });
      savedSuccessfullyRef.current = true;
      allowNavigationRef.current = true;
      setShowExitConfirm(false);
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
      title=""
      headerLeft={
        <Button variant="ghost" size="icon" className="h-10 w-10" onClick={handleBack} aria-label="Назад">
          <ArrowLeft className="h-5 w-5" />
        </Button>
      }
    >
      <div className="profile-edit-page flex flex-col flex-1 min-h-0">
        <div className="flex-1 min-h-0 overflow-y-auto">
          <div className="px-4 pt-2 pb-32 max-w-lg mx-auto flex flex-col gap-6">
          {loading ? (
            <div className="flex justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <>
              {/* Основная информация: Имя и Дата рождения */}
              <div className="bg-background rounded-[16px] p-4 shadow-sm border border-border flex flex-col gap-4">
                <div className="space-y-[6px]">
                  <Label htmlFor="child-name" className="text-sm font-medium">Имя</Label>
                  <Input
                    id="child-name"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Например: Маша, Папа"
                    className="h-11 border border-input bg-background rounded-xl text-[15px] placeholder:text-muted-foreground/70"
                  />
                </div>
                <div className="space-y-[6px]">
                  <Label htmlFor="child-birth" className="text-sm font-medium">Дата рождения <span className="text-destructive">*</span></Label>
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
                  {ageMonths != null && ageMonths >= 0 && birthDate?.trim() && (
                    <p className="text-[13px] text-muted-foreground">
                      Возраст: {formatAgeFromMonths(ageMonths)}
                    </p>
                  )}
                </div>
              </div>

              {/* Пищевые особенности: аллергии, любимые продукты, не ест — один блок */}
              <div className="bg-background rounded-[16px] p-4 shadow-sm border border-border flex flex-col gap-4">
                <div>
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-lg bg-amber-500/10 flex items-center justify-center shrink-0">
                      <UtensilsCrossed className="w-4 h-4 text-amber-700/80" />
                    </div>
                    <h3 className="text-base font-semibold text-foreground leading-tight">Пищевые особенности</h3>
                  </div>
                  <p className="text-[13px] text-muted-foreground mt-1">Мы учитываем это при подборе меню</p>
                </div>

                {/* Аллергии */}
                <div className="space-y-[6px]">
                  <Label htmlFor="child-allergy-add" className="text-sm font-medium flex items-center gap-1.5">
                    <span className="text-[18px] leading-none" aria-hidden>⚠️</span>
                    Аллергии
                  </Label>
                  {allergyItems.length > 0 && (
                    <div className="flex flex-wrap gap-2">
                      {allergyItems.map((item, i) => {
                        const isLocked = !hasAccess && !item.is_active;
                        return (
                          <span key={i} className="profile-tag-enter">
                            <PreferenceChip
                              label={item.value}
                              variant="allergy"
                              size="compact"
                              allowWrap
                              locked={isLocked}
                              onLockedClick={isLocked ? () => { setPaywallReason("allergies_locked"); setPaywallCustomMessage(FREE_ALLERGY_PAYWALL_MESSAGE); setShowPaywall(true); } : undefined}
                              removable={!isLocked}
                              onRemove={!isLocked ? () => allergiesHandlers.remove(i) : undefined}
                            />
                          </span>
                        );
                      })}
                    </div>
                  )}
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
                      className="w-5 h-5 rounded-full flex items-center justify-center shrink-0 bg-primary text-primary-foreground hover:opacity-90 disabled:opacity-50"
                      onClick={() => allergyInput.trim() && allergiesHandlers.add(allergyInput)}
                      disabled={!allergyInput.trim() || (isFree && activeAllergyCount >= limits.maxAllergiesPerProfile)}
                      aria-label="Добавить"
                    >
                      <Plus className="w-5 h-5" />
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
                      placeholder="Например: БКМ, орехи"
                      disabled={isFree && activeAllergyCount >= limits.maxAllergiesPerProfile}
                      className="flex-1 min-w-0 border-0 bg-transparent py-2 text-[15px] font-medium text-foreground focus:outline-none focus:ring-0 placeholder:text-muted-foreground/70 disabled:opacity-60"
                    />
                  </form>
                  {/* Smart suggestions — аллергии */}
                  <div className="flex flex-wrap gap-2">
                    {ALLERGY_SUGGESTIONS.filter((s) => !allergyValuesSet.has(normalizeAllergyToken(s).toLowerCase())).map((s) => (
                      <button
                        key={s}
                        type="button"
                        onClick={() => allergiesHandlers.add(s)}
                        className="h-7 rounded-[10px] px-[10px] py-[6px] text-[13px] font-medium border border-border bg-muted/40 text-foreground hover:bg-muted/60 transition-colors"
                      >
                        {s}
                      </button>
                    ))}
                  </div>
                  {isFree && (
                    <p className="text-[13px] text-muted-foreground">
                      {activeAllergyCount} из {limits.maxAllergiesPerProfile} аллергии
                    </p>
                  )}
                </div>

                {/* Любимые продукты */}
                {isFree ? (
                  <button
                    type="button"
                    onClick={openPaywallLikesDislikes}
                    className="text-left w-full rounded-xl border border-border bg-muted/20 p-4 hover:bg-muted/40 transition-colors"
                  >
                    <p className="text-sm font-medium text-foreground flex items-center gap-1.5">
                      <span className="text-[18px] leading-none" aria-hidden>❤️</span>
                      Любимые продукты
                    </p>
                    <div className="flex flex-wrap gap-2 mt-2">
                      {LIKES_GHOST_CHIPS.map((chip) => (
                        <PreferenceChip key={chip} label={chip} variant="like" size="compact" />
                      ))}
                    </div>
                    <div className="mt-3 w-full rounded-xl py-2.5 text-center text-sm font-medium border border-border text-muted-foreground">
                      ✨ Настроить (Premium)
                    </div>
                  </button>
                ) : (
                  <div className="space-y-[6px]">
                    <Label htmlFor="profile-likes" className="text-sm font-medium flex items-center gap-1.5">
                      <span className="text-[18px] leading-none" aria-hidden>❤️</span>
                      Любимые продукты
                    </Label>
                    <TagListEditor
                      id="profile-likes"
                      chipVariant="like"
                      items={likes}
                      inputValue={likesInput}
                      onInputChange={setLikesInput}
                      onAdd={likesHandlers.add}
                      onEdit={likesHandlers.edit}
                      onRemove={likesHandlers.remove}
                      placeholder="Например: ягоды, рыба"
                    />
                    <div className="flex flex-wrap gap-2">
                      {LIKES_SUGGESTIONS.filter((s) => !likesSet.has(normalizeChip(s))).map((s) => (
                        <button
                          key={s}
                          type="button"
                          onClick={() => likesHandlers.add(s)}
                          className="h-7 rounded-[10px] px-[10px] py-[6px] text-[13px] font-medium border border-border bg-muted/40 text-foreground hover:bg-muted/60 transition-colors"
                        >
                          {s}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* Не ест */}
                {isFree ? (
                  <button
                    type="button"
                    onClick={openPaywallLikesDislikes}
                    className="text-left w-full rounded-xl border border-border bg-muted/20 p-4 hover:bg-muted/40 transition-colors"
                  >
                    <p className="text-sm font-medium text-foreground flex items-center gap-1.5">
                      <span className="text-[18px] leading-none" aria-hidden>🚫</span>
                      Не ест
                    </p>
                    <div className="flex flex-wrap gap-2 mt-2">
                      {DISLIKES_GHOST_CHIPS.map((chip) => (
                        <PreferenceChip key={chip} label={chip} variant="dislike" size="compact" />
                      ))}
                    </div>
                    <div className="mt-3 w-full rounded-xl py-2.5 text-center text-sm font-medium border border-border text-muted-foreground">
                      ✨ Настроить (Premium)
                    </div>
                  </button>
                ) : (
                  <div className="space-y-[6px]">
                    <Label htmlFor="profile-dislikes" className="text-sm font-medium flex items-center gap-1.5">
                      <span className="text-[18px] leading-none" aria-hidden>🚫</span>
                      Не ест
                    </Label>
                    <TagListEditor
                      id="profile-dislikes"
                      chipVariant="dislike"
                      items={dislikes}
                      inputValue={dislikesInput}
                      onInputChange={setDislikesInput}
                      onAdd={dislikesHandlers.add}
                      onEdit={dislikesHandlers.edit}
                      onRemove={dislikesHandlers.remove}
                      placeholder="Например: лук, мясо"
                    />
                    <div className="flex flex-wrap gap-2">
                      {DISLIKES_SUGGESTIONS.filter((s) => !dislikesSet.has(normalizeChip(s))).map((s) => (
                        <button
                          key={s}
                          type="button"
                          onClick={() => dislikesHandlers.add(s)}
                          className="h-7 rounded-[10px] px-[10px] py-[6px] text-[13px] font-medium border border-border bg-muted/40 text-foreground hover:bg-muted/60 transition-colors"
                        >
                          {s}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {ageMonths != null && ageMonths < 12 && (
                  <div className="space-y-[6px]">
                    <Label htmlFor="profile-introduced-products" className="text-sm font-medium flex items-center gap-1.5">
                      <span className="text-[18px] leading-none" aria-hidden>🥄</span>
                      Уже введённые продукты
                    </Label>
                    <TagListEditor
                      id="profile-introduced-products"
                      chipVariant="like"
                      items={introducedProductKeys.map((key) => getProductDisplayLabel(key))}
                      inputValue={introducedProductsInput}
                      onInputChange={setIntroducedProductsInput}
                      onAdd={introducedHandlers.add}
                      onEdit={introducedHandlers.edit}
                      onRemove={introducedHandlers.remove}
                      placeholder="Например: кабачок, яблоко"
                    />
                    <p className="text-xs text-muted-foreground">
                      Используем для более мягкого подбора прикорма. Можно не заполнять.
                    </p>
                  </div>
                )}

                {!isNew && member && (
                  <div className="pt-4 border-t border-border/60">
                    <Button
                      variant="ghost"
                      className="w-full h-10 text-[13px] text-muted-foreground hover:text-destructive-hover hover:bg-muted/40 font-medium rounded-xl"
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
                className="w-full py-4 rounded-xl font-semibold text-[15px] border-0 shadow-button transition-all duration-200 bg-primary text-primary-foreground hover:bg-primary/90 hover:opacity-95 active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-primary disabled:hover:opacity-50"
                onClick={handleSave}
                disabled={isCreating || isUpdating || !hasChanges}
              >
                {(isCreating || isUpdating) ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin shrink-0" />
                    <span className="ml-2">Сохраняем...</span>
                  </>
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
            <AlertDialogTitle>У вас есть несохранённые изменения. Сохранить перед выходом?</AlertDialogTitle>
          </AlertDialogHeader>
          <AlertDialogFooter className="flex-col-reverse sm:flex-row gap-2">
            <AlertDialogCancel onClick={() => setShowExitConfirm(false)}>Отмена</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleExitWithoutSaving}
              className="bg-muted text-muted-foreground hover:bg-muted/80"
            >
              Не сохранять
            </AlertDialogAction>
            <AlertDialogAction
              onClick={() => handleSave()}
              disabled={isCreating || isUpdating}
              className="bg-primary text-primary-foreground hover:bg-primary/90"
            >
              {(isCreating || isUpdating) ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin shrink-0" />
                  <span className="ml-2">Сохраняем...</span>
                </>
              ) : (
                "Сохранить"
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </MobileLayout>
  );
}
