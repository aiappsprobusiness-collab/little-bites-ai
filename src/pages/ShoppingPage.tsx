import { MobileLayout } from "@/components/layout/MobileLayout";
import { Card, CardContent } from "@/components/ui/card";
import { ShoppingCart } from "lucide-react";

/** V2: Список покупок отключён до следующей итерации. Приоритет — Чат и База знаний. */
export default function ShoppingPage() {
  return (
    <MobileLayout title="Список покупок" showNav>
      <div className="px-4 pt-8 flex flex-col items-center justify-center min-h-[50vh]">
        <Card variant="elevated" className="max-w-sm w-full">
          <CardContent className="p-8 text-center">
            <ShoppingCart className="w-16 h-16 mx-auto mb-4 text-muted-foreground" />
            <h2 className="text-lg font-bold mb-2">Скоро</h2>
            <p className="text-sm text-muted-foreground">
              Список покупок будет доступен в следующем обновлении. Сейчас используйте Чат и Базу знаний.
            </p>
          </CardContent>
        </Card>
      </div>
    </MobileLayout>
  );
}
