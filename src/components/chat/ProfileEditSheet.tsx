import { useEffect, useState } from "react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useChildren } from "@/hooks/useChildren";
import { useToast } from "@/hooks/use-toast";
import type { Tables } from "@/integrations/supabase/types";

type Child = Tables<"children">;

function birthDateFromAgeMonths(ageMonths: number): string {
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

interface ProfileEditSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  child: Child | undefined;
}

export function ProfileEditSheet({ open, onOpenChange, child }: ProfileEditSheetProps) {
  const { toast } = useToast();
  const { updateChild, calculateAgeInMonths, isUpdating } = useChildren();
  const [ageMonths, setAgeMonths] = useState(0);
  const [allergiesStr, setAllergiesStr] = useState("");
  const [likesStr, setLikesStr] = useState("");
  const [dislikesStr, setDislikesStr] = useState("");

  useEffect(() => {
    if (!child || !open) return;
    setAgeMonths(calculateAgeInMonths(child.birth_date));
    setAllergiesStr((child.allergies ?? []).join(", "));
    setLikesStr((child.likes ?? []).join(", "));
    setDislikesStr((child.dislikes ?? []).join(", "));
  }, [child, open, calculateAgeInMonths]);

  const handleSave = async () => {
    if (!child) return;
    try {
      await updateChild({
        id: child.id,
        birth_date: birthDateFromAgeMonths(ageMonths),
        allergies: parseTags(allergiesStr),
        likes: parseTags(likesStr),
        dislikes: parseTags(dislikesStr),
      });
      toast({
        title: "Профиль обновлён",
        description: "Рекомендации учитывают новые данные.",
      });
      onOpenChange(false);
    } catch (e: any) {
      toast({
        variant: "destructive",
        title: "Ошибка",
        description: e.message || "Не удалось сохранить",
      });
    }
  };

  if (!child) return null;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="rounded-t-3xl flex flex-col max-h-[85vh]">
        <SheetHeader>
          <SheetTitle>Редактировать профиль — {child.name}</SheetTitle>
        </SheetHeader>
        <div className="space-y-4 py-4 overflow-y-auto">
          <div>
            <Label htmlFor="age">Возраст (мес.)</Label>
            <Input
              id="age"
              type="number"
              min={0}
              max={240}
              value={ageMonths || ""}
              onChange={(e) => setAgeMonths(parseInt(e.target.value, 10) || 0)}
              placeholder="Например, 24"
              className="mt-1"
            />
          </div>
          <div>
            <Label htmlFor="allergies">Аллергии (через запятую)</Label>
            <Input
              id="allergies"
              value={allergiesStr}
              onChange={(e) => setAllergiesStr(e.target.value)}
              placeholder="Молоко, глютен, орехи"
              className="mt-1"
            />
          </div>
          <div>
            <Label htmlFor="likes">Любит (через запятую)</Label>
            <Input
              id="likes"
              value={likesStr}
              onChange={(e) => setLikesStr(e.target.value)}
              placeholder="Банан, каша, творог"
              className="mt-1"
            />
          </div>
          <div>
            <Label htmlFor="dislikes">Не любит (через запятую)</Label>
            <Input
              id="dislikes"
              value={dislikesStr}
              onChange={(e) => setDislikesStr(e.target.value)}
              placeholder="Лук, брокколи"
              className="mt-1"
            />
          </div>
        </div>
        <Button
          className="w-full mt-auto"
          onClick={handleSave}
          disabled={isUpdating}
        >
          Сохранить и обновить рекомендации
        </Button>
      </SheetContent>
    </Sheet>
  );
}
