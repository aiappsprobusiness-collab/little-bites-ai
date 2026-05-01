import { useEffect, useRef, useState, type Dispatch, type SetStateAction } from "react";
import { useNavigate } from "react-router-dom";
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
import { useMembers, birthDateToAgeMonths, ageMonthsToBirthDate, memberTypeFromAgeMonths } from "@/hooks/useMembers";
import { useSubscription } from "@/hooks/useSubscription";
import { useToast } from "@/hooks/use-toast";
import { useAppStore } from "@/store/useAppStore";
import { normalizeAllergyToken } from "@/utils/allergyAliases";
import { PAYWALL_ADD_CHILD_CUSTOM_MESSAGE } from "@/constants/paywallCustomMessages";
import { FF_AUTO_FILL_AFTER_MEMBER_CREATE } from "@/config/featureFlags";
import { startFillDay, setJustCreatedMemberId, getPlanUrlForMember } from "@/services/planFill";
import { getVkDraftForProfilePrefill, markVkHandoffConsumed } from "@/utils/vkDraft";
import type { MembersRow } from "@/integrations/supabase/types-v2";
import { getSubscriptionLimits } from "@/utils/subscriptionRules";
import {
  FREE_ALLERGY_SINGLE_HINT_CREATE,
  PREMIUM_PROFILES_MAX_BODY,
  PREMIUM_PROFILES_MAX_TITLE,
} from "@/utils/friendlyLimitCopy";
import { Calendar } from "lucide-react";

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
  onCreated?: (
    memberId: string,
    meta?: { wasEmptyFamilyOnboarding: boolean },
  ) => void;
  /** When true, after creating a member we only call onCreated and do not run startFillDay/navigate (parent handles redirect). Meta передаётся в onCreated. */
  skipFillAndRedirectWhenCreated?: boolean;
  /** После подтверждения email (`/profile?welcome=1`): короткое приветствие в шапке формы создания профиля. */
  welcomeAfterEmailConfirm?: boolean;
}

export function ProfileEditSheet({
  open,
  onOpenChange,
  member,
  createMode = false,
  onAddNew,
  onCreated,
  skipFillAndRedirectWhenCreated = false,
  welcomeAfterEmailConfirm = false,
}: ProfileEditSheetProps) {
  const { toast } = useToast();
  const navigate = useNavigate();
  const { members, updateMember, createMember, deleteMember, isUpdating, isCreating, isDeleting } = useMembers();
  const { hasAccess, subscriptionStatus } = useSubscription();
  const limits = getSubscriptionLimits(subscriptionStatus);
  const showPaywall = useAppStore((s) => s.showPaywall);
  const setShowPaywall = useAppStore((s) => s.setShowPaywall);
  const setPaywallCustomMessage = useAppStore((s) => s.setPaywallCustomMessage);
  const setPaywallReason = useAppStore((s) => s.setPaywallReason);
  const [name, setName] = useState("");
  const [birthDate, setBirthDate] = useState("");
  const [allergies, setAllergies] = useState<string[]>([]);
  const [allergyInput, setAllergyInput] = useState("");
  const [likes, setLikes] = useState<string[]>([]);
  const [likesInput, setLikesInput] = useState("");
  const [dislikes, setDislikes] = useState<string[]>([]);
  const [dislikesInput, setDislikesInput] = useState("");
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
    if (sameKey) return;
    lastInitRef.current = key;

    if (isCreate) {
      const vk = getVkDraftForProfilePrefill();
      if (vk) {
        setName("");
        setBirthDate(ageMonthsToBirthDate(vk.age_months));
        setAllergies((vk.allergies ?? []).map(normalizeAllergyToken).slice(0, limits.maxAllergiesPerProfile));
        setAllergyInput("");
        setLikes((vk.likes ?? []).slice(0, limits.maxLikesTagsPerProfile));
        setLikesInput("");
        setDislikes((vk.dislikes ?? []).slice(0, limits.maxDislikesTagsPerProfile));
        setDislikesInput("");
        return;
      }
      setName("");
      setBirthDate("");
      setAllergies([]);
      setAllergyInput("");
      setLikes([]);
      setLikesInput("");
      setDislikes([]);
      setDislikesInput("");
      return;
    }
    if (!member) return;
    setName(member.name ?? "");
    setBirthDate(ageMonthsToBirthDate(member.age_months ?? null));
    setAllergies((member.allergies ?? []).map(normalizeAllergyToken));
    setAllergyInput("");
    setLikes((member as MembersRow).likes ?? []);
    setLikesInput("");
    setDislikes((member as MembersRow).dislikes ?? []);
    setDislikesInput("");
  }, [open, isCreate, member, limits.maxAllergiesPerProfile, limits.maxLikesTagsPerProfile, limits.maxDislikesTagsPerProfile]);

  const baseAllergiesHandlers = createTagListHandlers(setAllergies, setAllergyInput);
  const allergiesHandlers = {
    ...baseAllergiesHandlers,
    add: (raw: string) => {
      if (!hasAccess && allergies.length >= 1) {
        toast({
          title: "Важно учитывать всё питание ребёнка",
          description:
            "На бесплатном плане в профиле доступна одна аллергия. Полная версия позволяет указать несколько — откройте условия подписки ниже.",
        });
        setPaywallReason("onboarding_second_allergy_free");
        setPaywallCustomMessage(null);
        setShowPaywall(true);
        return;
      }
      if (hasAccess && allergies.length >= limits.maxAllergiesPerProfile) {
        toast({
          title: "Лимит аллергий",
          description: `В Premium можно указать до ${limits.maxAllergiesPerProfile} аллергий на профиль.`,
        });
        return;
      }
      const toAdd = parseTags(raw).map(normalizeAllergyToken).filter(Boolean);
      if (toAdd.length) {
        const existing = new Set(allergies.map((s) => s.trim().toLowerCase()));
        const added = toAdd.filter((v) => !existing.has(v.trim().toLowerCase()));
        if (added.length) {
          setAllergies((prev) =>
            [...prev, ...added].slice(0, limits.maxAllergiesPerProfile)
          );
        }
        setAllergyInput("");
      }
    },
  };
  function normalizeAndDedup(list: string[], toAdd: string[], max: number): string[] {
    const normalized = toAdd.map((s) => s.trim().toLowerCase()).filter(Boolean);
    const set = new Set([...list.map((s) => s.trim().toLowerCase()), ...normalized]);
    return Array.from(set).slice(0, max);
  }
  const likesHandlers = {
    add: (raw: string) => {
      const toAdd = parseTags(raw);
      if (toAdd.length) {
        setLikes((prev) =>
          normalizeAndDedup(prev, toAdd, limits.maxLikesTagsPerProfile)
        );
      }
      setLikesInput("");
    },
    remove: (index: number) => setLikes((prev) => prev.filter((_, i) => i !== index)),
    edit: (value: string, index: number) => {
      setLikesInput(value);
      setLikes((prev) => prev.filter((_, i) => i !== index));
    },
  };
  const dislikesHandlers = {
    add: (raw: string) => {
      const toAdd = parseTags(raw);
      if (toAdd.length) {
        setDislikes((prev) =>
          normalizeAndDedup(prev, toAdd, limits.maxDislikesTagsPerProfile)
        );
      }
      setDislikesInput("");
    },
    remove: (index: number) => setDislikes((prev) => prev.filter((_, i) => i !== index)),
    edit: (value: string, index: number) => {
      setDislikesInput(value);
      setDislikes((prev) => prev.filter((_, i) => i !== index));
    },
  };

  const handleSave = async () => {
    const trimmedName = name.trim();
    if (!trimmedName) {
      toast({ variant: "destructive", title: "Введите имя" });
      return;
    }
    const birthDateTrimmed = birthDate.trim();
    if (!birthDateTrimmed) {
      toast({ variant: "destructive", title: "Укажите дату рождения" });
      return;
    }
    const ageMonths = birthDateToAgeMonths(birthDateTrimmed);
    const type = memberTypeFromAgeMonths(ageMonths);

    if (isCreate) {
      if (!hasAccess && members.length >= limits.maxProfiles) {
        setPaywallReason("add_child_limit");
        setPaywallCustomMessage(PAYWALL_ADD_CHILD_CUSTOM_MESSAGE);
        setShowPaywall(true);
        return;
      }
      if (hasAccess && members.length >= limits.maxProfiles) {
        toast({
          title: PREMIUM_PROFILES_MAX_TITLE,
          description: PREMIUM_PROFILES_MAX_BODY.replace(/\n/g, " "),
        });
        return;
      }
      try {
        /** До await: после insert+invalidate родитель мог уже перерисоваться с members.length>=1, и проп skipFill стал бы ложным — снимаем факт «семья была пустой» здесь. */
        const wasEmptyFamilyBeforeCreate = members.length === 0;
        const vkHandoff = getVkDraftForProfilePrefill();
        const newMember = await createMember({
          name: trimmedName,
          type,
          age_months: ageMonths || null,
          allergies,
          ...(hasAccess && { likes, dislikes }),
        });
        if (vkHandoff) {
          markVkHandoffConsumed();
        }
        toast({ title: "Профиль создан", description: `«${trimmedName}» добавлен`, duration: 2000 });
        onOpenChange(false);
        onCreated?.(newMember.id as string, {
          wasEmptyFamilyOnboarding: wasEmptyFamilyBeforeCreate,
        });

        if (!skipFillAndRedirectWhenCreated && FF_AUTO_FILL_AFTER_MEMBER_CREATE) {
          try {
            await startFillDay(newMember.id as string);
            setJustCreatedMemberId(newMember.id as string);
            navigate(getPlanUrlForMember(newMember.id as string));
          } catch (fillError) {
            toast({
              variant: "destructive",
              title: "Ошибка",
              description: "Не удалось подобрать меню. Попробуйте снова.",
            });
          }
        }
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
    const existingType = (member as MembersRow).type;
    const typeToSave = existingType === "family" ? "family" : type;
    try {
      await updateMember({
        id: member.id,
        name: name.trim(),
        type: typeToSave,
        age_months: ageMonths || null,
        allergies,
        ...(hasAccess && { likes, dislikes }),
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

  return (
    <Sheet
      open={open}
      onOpenChange={(next) => {
        if (!next && showPaywall) return;
        onOpenChange(next);
      }}
    >
      <SheetContent
        side="bottom"
        className="rounded-t-3xl flex flex-col max-h-[85vh]"
        aria-describedby="profile-sheet-desc"
        onPointerDownOutside={(e) => {
          if (showPaywall) e.preventDefault();
        }}
        onInteractOutside={(e) => {
          if (showPaywall) e.preventDefault();
        }}
      >
        <p id="profile-sheet-desc" className="sr-only">Редактирование профиля</p>
        <SheetHeader>
          <SheetTitle>{isCreate ? "Новый профиль" : `Редактировать — ${member?.name ?? ""}`}</SheetTitle>
        </SheetHeader>
        <div className="space-y-5 py-4 overflow-y-auto">
          {isCreate && welcomeAfterEmailConfirm ? (
            <div
              className="rounded-xl border border-primary/25 bg-primary/10 px-3.5 py-3 text-sm leading-snug text-foreground"
              role="status"
            >
              <p className="font-semibold text-foreground">Добро пожаловать!</p>
              <p className="mt-1 text-muted-foreground">
                Email подтверждён. Заполните профиль — так меню и рекомендации будут точнее.
              </p>
            </div>
          ) : null}
          <p className="text-sm text-muted-foreground leading-relaxed">
            {isCreate
              ? "Добавьте профиль, чтобы мы учитывали особенности питания члена вашей семьи."
              : "Измените данные, чтобы рекомендации учитывали особенности питания."}
          </p>
          <div className="space-y-2 w-full min-w-0">
            <Label htmlFor="profile-name" className="text-sm font-medium">Имя</Label>
            <Input
              id="profile-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Например: Маша, Папа"
              className="h-11 w-full min-w-0 max-w-full box-border border-2 focus-visible:ring-offset-0"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="profile-birth" className="text-sm font-medium">Дата рождения <span className="text-destructive">*</span></Label>
            <div className="date-input-wrap relative rounded-xl border-2 border-input bg-background">
              <Input
                id="profile-birth"
                type="date"
                value={birthDate}
                onChange={(e) => setBirthDate(e.target.value)}
                className="h-11 min-h-0 border-0 bg-transparent rounded-xl pl-3 pr-12 focus-visible:ring-0 focus-visible:ring-offset-0"
              />
              <button
                type="button"
                onClick={() => document.getElementById("profile-birth")?.focus()}
                className="absolute right-0 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full flex items-center justify-center text-muted-foreground hover:text-foreground"
                aria-label="Выбрать дату"
              >
                <Calendar className="w-5 h-5" />
              </button>
            </div>
            <p className="text-xs text-muted-foreground">Возраст рассчитывается автоматически</p>
          </div>
          <TagListEditor
            label="Аллергии"
            chipVariant="allergy"
            items={allergies}
            inputValue={allergyInput}
            onInputChange={setAllergyInput}
            onAdd={allergiesHandlers.add}
            onEdit={allergiesHandlers.edit}
            onRemove={allergiesHandlers.remove}
            placeholder="Например: БКМ, орехи"
            helperText={
              !hasAccess && isCreate
                ? `Введите через запятую или нажмите Enter. ${FREE_ALLERGY_SINGLE_HINT_CREATE}`
                : "Введите через запятую или нажмите Enter"
            }
          />
          {hasAccess && (
            <>
              <TagListEditor
                label="Любит"
                chipVariant="like"
                items={likes}
                inputValue={likesInput}
                onInputChange={setLikesInput}
                onAdd={likesHandlers.add}
                onEdit={likesHandlers.edit}
                onRemove={likesHandlers.remove}
                placeholder="Например: ягоды, рыба"
                helperText="Введите через запятую или нажмите Enter"
              />
              <TagListEditor
                label="Не любит"
                chipVariant="dislike"
                items={dislikes}
                inputValue={dislikesInput}
                onInputChange={setDislikesInput}
                onAdd={dislikesHandlers.add}
                onEdit={dislikesHandlers.edit}
                onRemove={dislikesHandlers.remove}
                placeholder="Например: лук, мясо"
                helperText="Введите через запятую или нажмите Enter"
              />
            </>
          )}
        </div>
        <div className="flex flex-col gap-2 mt-auto pt-2">
          <Button
            className="w-full h-12 text-typo-body font-medium"
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
